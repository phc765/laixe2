
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client'; // Import createRoot

// Declare XLSX to inform TypeScript about the global variable
declare var XLSX: any;

// --- Data Interfaces ---
interface BangCap {
  loai: string;
  nganh: string;
  truong: string;
  namTotNghiep: string;
  hinhThucDaoTao?: string;
}

interface ChungChi {
  ten?: string;
  so: string;
  ngayCap: string;
  noiCap?: string;
}

interface GiayPhepLaiXe {
  so: string;
  hang: string;
  ngayCap: string;
  noiCap?: string;
  thoiHan: string;
}

interface HopDong {
  so: string;
  ngayKy: string;
  thoiHan: string;
}

interface Xe {
  bienSo: string;
  chuXe: string;
  soXe?: string;
}

interface TeacherProfile {
  stt: string;
  hoTen: string;
  ngaySinh: string;
  gioiTinh: 'Nam' | 'Nữ' | 'Khác';
  diaChi: string;
  soDienThoai: string;
  soCCCD?: string;
  ngayCapCCCD?: string;
  noiCapCCCD?: string;
  giayPhepLaiXe?: GiayPhepLaiXe;
  bangCap: BangCap[];
  chungChiSuPhamDayNghe?: ChungChi;
  chungChiGiaoVienDayLaiXe?: ChungChi;
  giayKhamSucKhoe: boolean;
  soYeuLyLich: boolean;
  banSaoKhaiSinh: boolean;
  hopDong?: HopDong;
  xe?: Xe;
  baoHiemXaHoi?: string; // "Bắt buộc", "Hưu trí", "Không tham gia"
  ghiChu?: string;
  coHopDong: boolean;
  coBHXH: boolean;
}

type FilterType = 'ALL' | 'HAS_CONTRACT' | 'NO_CONTRACT' | 'HAS_BHXH';

// --- Date Helper Functions ---
function normalizeAndFormatDate(dateInput?: string | number | Date): string | undefined {
    if (dateInput === undefined || dateInput === null) return undefined;

    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return undefined; // Invalid Date object
        const day = String(dateInput.getUTCDate()).padStart(2, '0');
        const month = String(dateInput.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
        const year = dateInput.getUTCFullYear();
        
        if (year < 1890 || year > 2200) { 
             return undefined; // Year out of typical range for this data
        }
        return `${day}/${month}/${year}`;
    }
    
    if (typeof dateInput === 'string') {
        const cleanedDateStr = dateInput.trim();
        if (cleanedDateStr === '') return undefined;

        const parts = cleanedDateStr.split(/[\/\-\.]/);
        if (parts.length === 3) {
            let day, month, year;
            if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4 && parseInt(parts[2], 10) > 1890) { // DD.MM.YYYY or DD/MM/YYYY
                day = parts[0]; month = parts[1]; year = parts[2];
            } else if (parts[0].length === 4 && parseInt(parts[0], 10) > 1890 && parts[1].length <= 2 && parts[2].length <= 2) { // YYYY.MM.DD or YYYY/MM/DD
                day = parts[2]; month = parts[1]; year = parts[0];
            } else {
                return cleanedDateStr; 
            }
            if (isNaN(parseInt(day, 10)) || isNaN(parseInt(month, 10)) || isNaN(parseInt(year, 10))) return cleanedDateStr;
            return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        }

        if (parts.length === 1 && /^\d{4}$/.test(cleanedDateStr) && parseInt(cleanedDateStr, 10) > 1890) { // YYYY only
            return `01/01/${cleanedDateStr}`;
        }
        return cleanedDateStr; 
    }

    if (typeof dateInput === 'number') {
        if (dateInput > 0 && dateInput < 2958465) { // Excel serial dates
            const date = new Date(Date.UTC(1899, 11, 30 + dateInput)); 
            if (isNaN(date.getTime())) return String(dateInput);

            const day = String(date.getUTCDate()).padStart(2, '0');
            const month = String(date.getUTCMonth() + 1).padStart(2, '0'); 
            const yearValue = date.getUTCFullYear();
            
            if (yearValue < 1890 || yearValue > 2200) return String(dateInput);
            return `${day}/${month}/${yearValue}`;
        }
        if (/^\d{4}$/.test(String(dateInput)) && dateInput > 1890 && dateInput < 2200) { // YYYY as number
             return `01/01/${String(dateInput)}`;
        }
        return String(dateInput); 
    }
    return undefined; 
}


function addOneYear(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr; 
  const day = parts[0];
  const month = parts[1];
  const year = parseInt(parts[2], 10);
  if (isNaN(year)) return dateStr; 
  return `${day}/${month}/${year + 1}`;
}


// --- Data Parsing Logic (TSV and Excel) ---
const commonRowToTeacherProfile = (values: any[]): TeacherProfile | null => {
  try {
    const stt = String(values[0] || '').trim();
    if (!stt) {
        // console.warn("Row skipped due to missing STT:", values);
        return null;
    }
    
    if (!values || values.length < 24) { // Check for minimum expected columns AFTER STT check
        // console.warn("Row with STT", stt, "has insufficient columns:", values.length);
        return null;
    }

    let hopDong: HopDong | undefined = undefined;
    let coHopDong = false;
    const hopDongRaw = String(values[22] || '');
    if (hopDongRaw) {
      const hopDongParts = hopDongRaw.split('\n');
      const soHd = hopDongParts[0]?.trim();
      
      if (soHd) {
        const ngayKyHdRaw = hopDongParts.length > 1 ? hopDongParts[1]?.trim() : undefined;
        const normalizedNgayKy = normalizeAndFormatDate(ngayKyHdRaw);
        if (normalizedNgayKy) {
          hopDong = {
            so: soHd,
            ngayKy: normalizedNgayKy,
            thoiHan: addOneYear(normalizedNgayKy),
          };
          coHopDong = true;
        } else if (ngayKyHdRaw) { 
            hopDong = { so: soHd, ngayKy: ngayKyHdRaw, thoiHan: 'N/A'}; // Keep raw if normalization fails but was present
            coHopDong = true;
        } else { 
            hopDong = { so: soHd, ngayKy: 'N/A', thoiHan: 'N/A' };
            coHopDong = true;
        }
      }
    }


    let baoHiemXaHoiStatus = 'Không tham gia';
    let hasBHXH = false;
    const bhxhVal = String(values[23] || '').trim().toUpperCase();
    const ghiChuVal = String(values[24] || '').trim();

    if (bhxhVal === 'BB') {
      hasBHXH = true;
      if (ghiChuVal.toLowerCase().includes('hưu trí')) {
        baoHiemXaHoiStatus = 'Bắt buộc (Hưu trí)';
      } else if (ghiChuVal.toLowerCase().includes('đơn vị khác')) {
         baoHiemXaHoiStatus = 'Bắt buộc (Đơn vị khác)';
      }
      else {
        baoHiemXaHoiStatus = 'Bắt buộc';
      }
    } else if (bhxhVal === 'TN') {
      baoHiemXaHoiStatus = 'Tự nguyện'; // TN implies no mandatory BHXH for filtering
      hasBHXH = false; 
    }

    const gioiTinhRaw = String(values[4] || '').trim();

    const profile: TeacherProfile = {
      stt: stt,
      hoTen: String(values[1] || '').trim() || 'N/A',
      ngaySinh: normalizeAndFormatDate(values[2]) || 'N/A',
      gioiTinh: (gioiTinhRaw === 'Nam' || gioiTinhRaw === 'Nữ') ? gioiTinhRaw : 'Khác',
      diaChi: String(values[5] || '').trim() || 'N/A',
      soDienThoai: String(values[6] || '').trim() || 'N/A',
      soCCCD: String(values[9] || '').trim() || undefined,
      ngayCapCCCD: normalizeAndFormatDate(values[10]) || undefined,
      noiCapCCCD: String(values[11] || '').trim() || undefined,
      bangCap: values[12] ? [{
        loai: String(values[12] || '').trim(),
        nganh: 'N/A',
        truong: 'N/A',
        namTotNghiep: 'N/A',
        hinhThucDaoTao: 'N/A',
      }] : [],
      giayPhepLaiXe: (values[14] && values[13] && values[15] && values[17]) ? {
        so: String(values[14] || '').trim(),
        hang: String(values[13] || '').trim(),
        ngayCap: normalizeAndFormatDate(values[15]) || 'N/A',
        noiCap: String(values[16] || '').trim() || undefined,
        thoiHan: normalizeAndFormatDate(values[17]) || 'N/A',
      } : undefined,
      chungChiGiaoVienDayLaiXe: (values[19] && values[20]) ? {
        ten: String(values[18] || '').trim() || undefined,
        so: String(values[19] || '').trim(),
        ngayCap: normalizeAndFormatDate(values[20]) || 'N/A',
        noiCap: String(values[21] || '').trim() || undefined,
      } : undefined,
      giayKhamSucKhoe: true, 
      soYeuLyLich: true,    
      banSaoKhaiSinh: true,  
      hopDong: hopDong,
      coHopDong: coHopDong,
      baoHiemXaHoi: baoHiemXaHoiStatus,
      coBHXH: hasBHXH,
      ghiChu: ghiChuVal || undefined,
      xe: undefined, 
      chungChiSuPhamDayNghe: undefined,
    };
    return profile;
  } catch (error) {
    console.error("Error parsing row: ", values, error);
    return null;
  }
};


const tsvData = `TT	HỌ VÀ TÊN	NĂM SINH	NƠI SINH	Giới tính	Địa chỉ	Điện thoại	STK	NGÂN HÀNG	 SỐ CMT	NGÀY CẤP	NƠI CẤP	BẰNG TC TRỞ LÊN	HẠNG	SỐ GPLX	NGÀY CẤP	NƠI CẤP	THỜI HẠN	CHỨNG NHẬN GVDL	SỐ GCN	NGÀY CẤP	NƠI CẤP	SỐ, NGÀY THÁNG NĂM KÝ HĐ HIỆN TẠI 	BHXH	Ghi chú
1	Dương Tuấn Anh	20/9/1982	Hà Nội	Nam	Hưng Đạo, Tây Đằng, Ba Vì, Hà Nội	0988034112	0988034112	MB	001082039758	16/04/2021	Cục Cảnh sát	Cao đẳng	B2	010164001401	11/1/2016	Sở GTVT Hà Nội	11/1/2026	B2	02-114	4/5/2020	Sở GTVT Hà Nội	"221/HĐTG\\n28/03/2025"	TN	
2	Đào Quang Biên	19/11/1981	Hà Nội	Nam	Tân An- Cẩm Lĩnh- Ba Vì- Hà Nội	0981954681	3356665678888	 MB 	001081013044	10/7/2021	Cục Cảnh sát	Trung cấp	E	010042029240	20/1/2021	Sở GTVT Phú Thọ	20/1/2026	B2	3555	30/12/2009	Sở GTVT Hà Nội	"222/HĐTG\\n28/03/2025"	TN	
3	Ngô Văn Chiến	18/2/1991	Hà Nội	Nam	Thụy Phiêu- Thụy An- Ba Vì- Hà Nội	0963543280	4510510056	BIDV	001091057912	24/07/2021	Cục Cảnh sát	Trung cấp	D	010101056251	15/12/2021	Sở GTVT Hà Nội	15/12/2026	B2	02-222	4/5/2020	Sở GTVT Hà Nội	"223/HĐTG\\n28/03/2025"	TN	
4	Khuất Duy Cương	30/10/1985	Hà Nội	Nam	Mỹ Giang- Trạch Mỹ Lộc- Phúc Thọ- Hà Nội	0976207026	4510813180	 BIDV 	001085006801	4/6/2015	Cục Cảnh sát	Cao đẳng	B2	010099037513	28/1/2015	Sở GTVT Hà Nội	28/1/2025	B2	02-97	7/9/2018	Sở GTVT Hà Nội	"224/HĐTG\\n28/03/2025"	TN	
5	Phùng Hùng Cường	27/7/1978	Hà Nội	Nam	Tổ 2, Ái Mỗ, Trung Hưng, Sơn Tây, Hà Nội	0983892868	9012345688888	 MB 	001078008350	21/08/2018	Cục Cảnh sát	Đại học	D	010106007313	28/2/2020	Sở GTVT Hà Nội	28/2/2025	B2	4921	13/12/2010	Sở GTVT Hà Nội	"225/HĐTG\\n28/03/2025"	TN	
6	Nguyễn Trần Đạo	31/10/1978	Hà Sơn Bình	Nam	Bùi Thị Xuân, Quang Trung, Sơn Tây, Hà Nội	0943833477	4510418080	 BIDV 	001078027110	10/4/2021	Cục Cảnh sát	Trung cấp	D	990146000454	14/1/2019	Sở GT Hà Nội	27/12/2028	B2	4286	1/7/2010	Sở GT Hà Nội	"226/HĐTG\\n28/03/2025"	TN	
7	Tạ Xuân Dậu	18/11/1981	Hà Sơn Bình	Nam	TriThủy, Tri Thủy, Phú Xuyên, Hà Nội	0972794078	0972794078	MB	001081007709	10/07/2021	Cục Cảnh sát	Đại học	C	010062000870	29/12/2006	Sở GTVT Vĩnh Phúc	16/9/2025	B2	02-147	4/5/2020	Sở GTVT Hà Nội	"227/HĐTG\\n28/03/2025"	TN	
8	Nguyễn Quốc Đô	16/3/1991	Hà Nội	Nam	Tân Phong 2- Phong Vân- Ba Vì- Hà Nội	0978431790	0978431790	MB	001091056262	10/7/2021	Cục Cảnh sát	Thạc sĩ	B2	010140037266	18/11/2015	Sở GTVT Hà Nội	18/11/2025	B2	02-247	3/8/2020	Sở GTVT Hà Nội	"228/HĐTG\\n28/03/2025"	TN	
9	Nguyễn Văn Đức	10/7/1993	Hà Tây	Nam	171 Bảo Lộc- Võng Xuyên- Phúc Thọ- Hà Nội	0983932993	0983932993	MB	001093023632	7/8/2019	Cục Cảnh sát	Trung cấp	B2	010163033487	10/5/2016	Sở GTVT Hà Nội	10/5/2026	B2	40-327	07/08/2023	Sở GTVT Hà Nội	"229/HĐTG\\n28/03/2025"	TN	
10	Nguyễn Mạnh Dũng	21/12/1981	Hà Nội	Nam	156 Phố Hàng- Sơn Tây- Hà Nội	0968875796	1981198355555	 MB 	001081004156	04/05/2021	Cục Cảnh sát	Trung cấp	D	010064024632	10/5/2022	Sở GTVT Hà Nội	10/5/2027	C	3886	5/2/2010	Sở GTVT Hà Nội	"230/HĐTG\\n28/03/2025"	TN	
11	Phạm Tiến Dũng	12/11/1970	Hà Tây	Nam	128 Thanh Vị- Sơn Lộc- Sơn Tây- Hà Nội	0928812555	4510154153	BIDV	001070040551	28/9/2021	Cục Cảnh sát	Trung cấp	B2	010069009346	1/8/2014	Sở GTVT Hà Nội	1/8/2034	B2	3587	30/12/2009	Sở GTVT Hà Nội	"231/HĐTG\\n28/03/2025"	TN	
12	Đỗ Như Dược	20/10/1983	Hà Nội	Nam	Đoàn Kết- Dị Nậu- Thạch Thất- Hà Nội	0966270684	2214205055327	Agribank	001083010991	10/07/2021	Cục Cảnh sát	Cao đẳng	B2	010125040836	20/6/2022	Sở GTVT Hà Nội	20/6/2032	B2	02-120	04/5/2020	Sở GTVT Hà Nội	"232/HĐTG\\n28/03/2025"	TN	
13	Chu Mạnh Hà	30/4/1979	Hà Nội	Nam	Vân Gia, Trung Hưng, Sơn Tây, Hà Nội	0948790979	0948790979	MB	001079034989	29/04/2021	Cục Cảnh sát	Trung cấp	E	010119013985	3/4/2020	Sở GTVT Hà Nội	3/4/2025	C	02-265	10/5/2021	Sở GTVT Hà Nội	"233/HĐTG\\n28/03/2025"	TN	
14	Phùng Văn Hiển	28/5/1982	Hà Nội	Nam	Tri Lai- Đồng Thái- Ba Vì- Hà Nội	0979761663	6821982198282	 MB 	001082009322	24/07/2021	Cục Cảnh sát	Cao đẳng	B2	010152044106	25/6/2015	Sở GTVT Hà Nội	25/6/2025	B2	02-271	10/5/2021	Sở GT Hà Nội	"234/HĐTG\\n28/03/2025"	TN	
15	Khuất Huy Hiệp	29/6/1985	Hà Nội	Nam	Cụm 8, thị trấn Phúc Thọ, Phúc Thọ, Hà Nội	0948520548	296198599999	 TechombanK 	001085032003	09/04/2021	Cục Cảnh sát	Trung cấp	B2	010165033416	22/8/2016	Sở GTVT Hà Nội	22/8/2026	B2	02-228	4/5/2020	Sở GTVT Hà Nội	"235/HĐTG\\n28/03/2025"	TN	
16	Hoàng Thị Ninh Hòa	14/9/1990	Quảng Ninh	Nữ	La Gián- Cổ Đông- Sơn Tây- Hà Nội	0868459096	6030107370003	MB	022190007854	24/4/2021	Cục Cảnh sát	Trung cấp	B2	011191006003	12/2/2019	Sở GTVT Hà Nội	12/2/2029	B2	02-391	14/11/2023	Sở GTVT Hà Nội	"236/HĐTG\\n28/03/2025"	TN	
17	Nguyễn Văn Hoàng	25/1/1996	Thanh Hóa	Nam	Thôn Thượng- Vĩnh Yên- Vĩnh Lộc- Thanh Hoá	0965441054	0897647699999	MB	038096030971	20/08/2021	Cục Cảnh sát	Trung cấp	C	380141018862	18/8/2022	Sở GTVT Hà Nội	18/8/2027	B2	02-274	10/5/2021	Sở GTVT Hà Nội	"237/HĐTG\\n28/03/2025"	TN	
18	Nguyễn Văn Hơn	6/4/1996	Hà Nội	Nam	Cụm 10- Võng Xuyên- Phúc Thọ- Hà Nội	0981906496	4510712348	BIDV	001096034811	10/07/2021	Cục Cảnh sát	Đại học	B2	010142057239	04/07/2016	Sở GTVT Hà Nội	4/7/2026	B2	02-156	4/5/2020	Sở GTVT Hà Nội	"238/HĐTG\\n28/03/2025"	TN	
19	Nguyễn Phạm Hùng	8/11/1975	Hà Nội	Nam	Số 30 Ngõ Phố Hàng- Phú Thịnh- Sơn Tây- Hà Nội	0983751265	0983751265	 MB 	001075024378	4/5/2021	Cục Cảnh sát	Trung cấp	D	010109001060	27/7/2022	Sở GTVT Hà Nội	27/7/2028	B2	02-384	7/11/2023	Sở GTVT Hà Nội	"239/HĐTG\\n28/03/2025"	TN	
20	Đặng Ngọc Hường	2/9/1981	Phú Thọ	Nam	Liên Minh- Thụy An- Ba Vì- Hà Nội	0335478932	0848464368	 MB 	025081008045	24/7/2021	Cục Cảnh sát	Trung cấp	B2	010128006594	8/1/2020	Sở GTVT Hà Nội	8/1/2030	B2	02-278	10/5/2021	Sở GTVT Hà Nội	"240/HĐTG\\n28/03/2025"	TN	
21	Phạm Thị Thu Huyền	14/10/1985	Hà Tây	Nữ	30C/2 Đinh Tiên Hoàng- Ngô Quyền- Sơn Tây- Hà Nội	0865658095	0650178859999	MB	001185028674	19/8/2021	Cục Cảnh sát	Trung cấp	B2	011171029208	27/6/2017	Sở GT Hà Nội	27/6/2027	B2	02-280	10/5/2021	Sở GT Hà Nội	"241/HĐTG\\n28/03/2025"	TN	
22	Đinh Thị Thu Huyền 	08/12/1985	Phú Thọ	Nữ	20/75 Phố Hàng- Phú Thịnh- Sơn Tây- Hà Nội	0385182663	4510252765	 BIDV 	025185000952	1/11/2021	Cục Cảnh sát	Đại học	C	011079000550	30/6/2022	Sở GTVT Hà Nội	30/6/2027	B2	30-25	16/9/2015	Sở GTVT Hà Nội	"242/HĐTG\\n28/03/2025"	TN	
23	Đặng Văn Khánh	18/8/1987	Hà Nội	Nam	Thôn 4- Vân Phúc- Phúc Thọ- Hà Nội	0914383287	19031935783015	 TechcombanK 	001087016031	4/5/2021	Cục Cảnh sát	Trung cấp	E	001087016031	5/8/2020	Sở GTVT Hà Nội	5/8/2025	C	28-105	25/11/2019	Sở GTVT Hà Nội	"243/HĐTG\\n28/03/2025"	TN	
24	Diệp Hoàng Lâm	5/2/1980	Phúc Thọ	Nam	Tổ dân phố 6, Thị trấn Phúc Thọ, Phúc Thọ, Hà Nội	0813662268	66662256789	MB	001080032301	09/04/2021	Cục Cảnh sát	Trung cấp	B2	010112021231	8/9/2020	Sở GTVT Vĩnh Phúc	8/9/2030	B2	02-285	10/5/2021	Sở GTVT Hà Nội	"244/HĐTG\\n28/03/2025"	TN	
25	Nguyễn Trọng Lâm	23/10/1962	Hà Nội	Nam	Phố Hàng, Phú Thịnh, Sơn Tây, Hà Nội	0912438018	2203205191866	 AgribanK 	001062020619	04/05/2021	Cục Cảnh sát	Trung cấp	B2	010066002278	21/10/2015	Sở GTVT Hà Nội	21/10/2025	B2	3557	30/12/2009	Sở GTVT Hà Nội	"245/HĐTG\\n28/03/2025"	TN	
26	Vũ Huy Linh	18/9/1990	Hà Nội	Nam	Đại Đồng- Thạch Thất- Hà Nội	0973928523	4520512624	 BIDV 	001090054417	24/7/2021	Cục Cảnh sát	Đại học	B2	010153082150	29/10/2015	Sở GTVT Hà Nội	29/10/2025	B2	02-165	4/5/2020	Sở GTVT Hà Nội	"246/HĐTG\\n28/03/2025"	TN	
27	Nguyễn Bá Linh	7/3/1987	Hà Nội	Nam	Hưng Đạo, Tây Đằng, Ba Vì, Hà Nội	0988707387	2210205349369	Agribank	001087038483	18/4/2021	Cục Cảnh sát	Đại học	B2	010143001853	11/3/2024	Sở GTVT Phú Thọ	11/3/2034	B2	02-164	4/5/2020	Sở GTVT Hà Nội	"247/HĐTG\\n28/03/2025"	TN	
28	Lê Văn Long	5/3/1987	Hòa Bình	Nam	Tiểu Khu 5- TT Lương Sơn- Lương Sơn- Hoà Bình	0968651166	03879830501	TPBanK	017087000612	14/04/2021	Cục Cảnh sát	Trung cấp	C	010141057445	27/08/2014 	Sở GTVT Hà Nội	26/8/2034	C	02-288	10/5/2021	Sở GTVT Hà Nội	"248/HĐTG\\n28/03/2025"	TN	
29	Nguyễn Quang Mạnh	21/1/1976	Hà Nội	Nam	Cụm 8, Phúc Thọ, Phúc Thọ, Hà Nội	0947286228	4510155615	BIDV	001076057958	24/06/2021	Cục Cảnh sát	Trung cấp	C	010075004292	22/5/2023	Sở GTVT Vĩnh Phúc	22/5/2028	B2	5463	7/12/2011	Sở GTVT Hà Nội	"249/HĐTG\\n28/03/2025"	TN	
30	Mai Đình Đức Minh	27/5/2002	Hà Tây	Nam	Phú Nhi- Phú Thịnh- Sơn Tây- Hà Nội	0968150865	2563381633	VPbank	001202021294	13/9/2023	Cục Cảnh sát	Trung cấp	B2	010202115381	16/11/2020	Sở GTVT Hà Nội	16/11/2030	B2	40-429	9/4/2024	Sở GTVT Hà Nội	"250/HĐTG\\n28/03/2025"	TN	
31	Phùng Hùng Nam	8/7/1981	Hà Nội	Nam	Ái Mỗ- Trung Hưng- Sơn Tây- Hà Nội	0987805405	9981838688888	MB	001081025607	9/5/2021	Cục Cảnh sát	Trung cấp	B2	010099023914	3/9/2014	Sở GTVT Hà Nội	3/9/2034	B2	40-432	9/4/2024	Sở GTVT Hà Nội	"251/HĐTG\\n28/03/2025"	TN	
32	Cấn Thị Bích Ngọc	5/6/1991	Hà Nội	Nữ	Dị Nậu, Thạch Thất, Hà Nội	0966001991	4510578212	 BIDV 	001191056688	26/02/2022	Cục Cảnh sát	Đại học	B2	011159021981	18/5/2015	Sở GTVT Hà Nội	18/5/2025	B2	02-100	7/9/2018	Sở GTVT Hà Nội	"252/HĐTG\\n28/03/2025"	TN	
33	Nguyễn Quốc Nhuận	24/8/1986	Hà Nộị	Nam	Cao Cương- Đông Quang- Ba Vì- Hà Nội	0985238829	991198699999	MB	001086029731	25/7/2021	Cục Cảnh sát	Đại học	B2	010125030125	8/11/2016	Sở GTVT Hà Nội	8/11/2026	B2	02-393	14/11/2023	Sở GTVT Hà Nội	"253/HĐTG\\n28/03/2025"	TN	
34	Phùng Thúy Oanh	9/9/1989	Hà Nội	Nữ	Thôn 4- Vân Phúc- Phúc Thọ- Hà Nội	0917716783	4719898888	 TecombanK 	001189009620	4/5/2021	Cục Cảnh sát	Cao đẳng	B2	011200013534	27/2/2020	Sở GTVT Hà Nội	27/2/2030	B2	02-386	7/11/2023	Sở GTVT Hà Nội	"254/HĐTG\\n28/03/2025"	TN	
35	Đoàn Trọng Phú	1/3/1984	Hà Tây	Nam	Bảo Lộc 2- Võng Xuyên- Phúc Thọ- Hà Nội	0972894386	8330111848888	 MB 	001084016205	10/7/2021	Cục Cảnh sát	Trung cấp	B2	010186040129	3/5/2018	Sở GTVT Hà Nội	3/5/2028	B2	02-394	14/11/2023	Sở GTVT Hà Nội	"255/HĐTG\\n28/03/2025"	TN	
36	Nguyễn Đình Quân	16/2/1987	Hà Nội	Nam	Hưng Đạo, Tây Đằng, Ba Vì, Hà Nội	0978034598	0011004017492	 VietcombanK 	001087006215	18/05/2015	Cục Cảnh sát	Đại học	B2	990123995360	26/8/2015	Sở GTVT Hà Nội	26/8/2025	B2	02-182	4/5/2020	Sở GTVT Hà Nội	"256/HĐTG\\n28/03/2025"	TN	
37	Đỗ Mạnh Quân	6/8/1988	Hà Tây	Nam	Thôn 9- Phụng Thượng- Phúc Thọ- Hà Nội	0974306188	0974306188	MB	001088046360	29/6/2021	Cục Cảnh sát	Trung cấp	D	010080003530	29/12/2021	Sở GTVT Hà Nội	29/12/2026	B2	5365	13/9/2011	Sở GTVT Hà Nội	"257/HĐTG\\n28/03/2025"	TN	
38	Phạm Đăng Quang	15/11/1995	Hà Tây	Nữ	Khu 15- Đông Phong- Tiên Phong- Ba Vì- Hà Nội	0866065595	0866065595	 MB 	034035016461	10/05/2021	Cục Cảnh sát	Đại học	B2	010147013269	04/9/2018	Sở GT Hà Nội	04/9/2028	B2	02-368	28/3/2022	Sở GT Hà Nội	"258/HĐTG\\n28/03/2025"	TN	
39	Đoàn Trọng Quyên	28/5/1990	Hà Nội	Nam	Bảo Lộc 2- Võng Xuyên- Phúc Thọ- Hà Nội	0975649746	5550128051990	 MB 	001090015335	19/04/2022	Cục Cảnh sát	Cao đẳng	D	010103041871	08/10/2021	Sở GTVT Hà Nội	8/10/2026	B2	02-10	29/9/2016	Sở GTVT Hà Nội	"259/HĐTG\\n28/03/2025"	TN	
40	Nguyễn Văn Quyết	4/4/1974	Thái Bình	Nam	Số 4- Ngách 2- Phố Hàng- Phú Thịnh- Sơn Tây- Hà Nội	0912156160	9999904041974	 MB 	034074001032	10/05/2021	Cục Cảnh sát	Cao đẳng	E	010046000191	19/10/2022	Sở GTVT Hà Nội	19/10/2027	C	02-29	12/2/2018	Sở GTVT Hà Nội	"260/HĐTG\\n28/03/2025"	TN	
41	Đặng Hùng Quyết	16/5/1996	Hà Nội	Nam	Thanh Lũng- Tiên Phong- Ba Vì- Hà Nội	0984790088	1019998386	Vpbank	001096044976	25/7/2021	Cục Cảnh sát	Đại học	B2	010148057217	26/7/2018	Sở GTVT Hà Nội	24/7/2028	B2	02-372	4/4/2022	Sở GTVT Hà Nội	"261/HĐTG\\n28/03/2025"	BB	Đơn vị khác
42	Phan Thành Sơn	10/5/1984	Hà Nội	Nam	Xóm 8, Phú Châu, Ba Vì, Hà Nội	0969659223	4550893621	 BIDV 	001084009122	10/11/2023	Cục Cảnh sát	Đại học	B2	010156090596	27/11/2015	Sở GTVT Hà Nội	27/11/2025	B2	02-128	4/5/2020	Sở GTVT Hà Nội	"262/HĐTG\\n28/03/2025"	TN	
43	Đào Ngọc Sơn	30/10/1975	Hà Nội	Nam	Thôn Năn, Sơn Đông, Sơn Tây, Hà Nội	0979375078	3010757868888	MB	001075007331	15/04/2021	Cục Cảnh sát	Đại học	B2	010117025386	16/11/2015	Sở GTVT Hà Nội	16/11/2025	B2	02-187	4/5/2020	Sở GTVT Hà Nội	"263/HĐTG\\n28/03/2025"	TN	
44	Đặng Xuân Sơn	11/5/1975	Hà Tây	Nam	Ngõ 20- Phố Hàng- Phú Thịnh- Sơn Tây- Hà Nội	0962720111	03301014936372	 MSB 	001075047100	10/05/2021	Cục Cảnh sát	Đại học	B2	010151008097	27/1/2015	Sở GTVT Hà Nội	14/4/2025	B2	02-310	10/5/2021	Sở GTVT Hà Nội	"264/HĐTG\\n28/03/2025"	TN	
45	Bùi Ngọc Sơn	11/11/1992	Thái Bình	Nam	137 Ngô Quyền- Sơn Tây- Hà Nội	0353869292	4516111192	BIDV	034092024030	10/5/2021	Cục Cảnh sát	Đại học	C	010159004530	14/1/2020	Sở GTVT Hà Nội	14/1/2025	C	02-186	04/05/2020	Sở GTVT Hà Nội	"265/HĐTG\\n28/03/2025"	TN	
46	Nguyễn Đỗ Tân	15/8/1990	Hà Nội	Nam	Bảo Lộc 2- Võng Xuyên- Phúc Thọ- Hà Nội	0984193488	4510808830	 BIDV 	001090006184	10/07/2021	Cục Cảnh sát	Trung cấp	C	010169117831	14/10/2021	Sở GT Hà Nội	14/10/2026	B2	02-233	04/5/2020	Sở GTVT Hà Nội	"266/HĐTG\\n28/03/2025"	TN	
47	Đinh Văn Thái	8/9/1980	Hà Nội	Nam	4/1 Trần Hưng Đạo- Ngô Quyền- Sơn Tây- Hà Nội	0988431980	3511448888	LP Bank	001080025943	10/5/2021	Cục Cảnh sát	Trung cấp	B2	010031007451	8/10/2014	Sở GTVT Hà Nội	8/10/2034	B2	4230	14/5/2010	Sở GTVT Hà Nội	"267/HĐTG\\n28/03/2025"	TN	
48	Nguyễn Mạnh Thắng	20/10/1961	Hà Tây	Nam	504 B8 Nghĩa Tân, Nghĩa Tân, Cầu Giấy, Hà Nội	0983225561	19036721875011	 TecombanK 	001061005360	10/07/2021	Cục Cảnh sát	Trung cấp	B2	010061003029	14/2/2014	Sở GT Hà Nội	14/2/2034	B2	3562	30/12/2009	Sở GT Hà Nội	"268/HĐTG\\n28/03/2025"	TN	
49	Nguyễn Đăng Thắng	15/5/1985	Hà Nội	Nam	Tiền Huân- Viên Sơn- Sơn Tây- Hà Nội	0364708885	2203205169158	Agribank	001085026812	10/7/2021	Cục Cảnh sát	Trung cấp	B2	010178064892	19/7/2017	Sở GTVT Hà Nội	19/7/2027	B2	02-318	10/5/2021	Sở GTVT Hà Nội	"269/HĐTG\\n28/03/2025"	TN	
50	Hoàng Văn Thảo 	12/3/1970	Hà Tây	Nam	Tổ dân phố 2- Trung Hưng- Sơn Tây- Hà Nội	0983662230	2203205059165	Agribank	001070019671	08/12/2022	Cục Cảnh sát	Đại học	E	010063016441	12/3/2020	Sở GTVT Hà Nội	12/3/2025	C	1768	12/10/2009	Sở GTVT Hà Nội	"270/HĐTG\\n28/03/2025"	TN	
51	Khuất Đình Thi	25/12/1976	Hà Nội	Nam	Tổ 3- TT Phúc Thọ- Phúc Thọ- Hà Nội	0986489766	4511260248	 BIDV 	001076030131	09/04/2021	Cục Cảnh sát	Trung cấp	E	010105002001	13/6/2018	Sở GTVT Hà Nội	8/6/2028	C	02-327	10/5/2021	Sở GTVT Hà Nội	"271/HĐTG\\n28/03/2025"	TN	
52	Khuất Hữu Thịnh	12/10/1986	Hà Tây	Nam	Cụm 2- Thọ Lộc- Phúc Thọ- Hà Nội	0986931239	0986931239	 MB 	001086031162	19/8/2021	Cục Cảnh sát	Trung cấp	C	010161003703	18/12/2020	Sở GTVT Vĩnh Phúc	18/12/2025	C	02-328	10/5/2021	Sở GTVT Hà Nội	"272/HĐTG\\n28/03/2025"	TN	
53	Khuất Thị Thức	28/9/1980	Hà Tây	Nữ	Cụm 8, thị trấn Phúc Thọ, Phúc Thọ, Hà Nội	0976207026	4510194797	 BIDV 	001180010017	10/07/2021	Cục Cảnh sát	Trung cấp	B2	01108400075	3/2/2019	Sở GT Hà Nội	3/12/2029	B2	02-236	4/5/2020	Sở GTVT Hà Nội	"273/HĐTG\\n28/03/2025"	TN	
54	Phùng Văn Toàn	1/3/1988	Hà Nội	Nam	Trung tâm Sơn Đông- Sơn Tây- Hà Nội	0986444478	6789567891988	 MB 	001088018119	10/7/2021	Cục Cảnh sát	Đại học	B2	010200021914	27/2/2020	Sở GTVT Hà Nội	27/2/2030	B2	02-390	7/11/2023	Sở GTVT Hà Nội	"274/HĐTG\\n28/03/2025"	TN	
55	Khuất Hữu Trường	10/2/1986	Hà Nội	Nam	Cụm 2- Thọ Lộc- Phúc Thọ- Hà Nội	0964991830	2212205234881	Agribank	001086010877	01/05/2021	Cục Cảnh sát	Trung cấp	C	01055000800	01/08/2011	Sở GT Vĩnh Phúc	13/11/2025	C	02-102	7/9/2018	Sở GT Hà Nội	"275/HĐTG\\n28/03/2025"	TN	
56	Phùng Mạnh Trường	20/9/1975	Hà Tây	Nam	Tân Phúc, Sơn Đông, Sơn Tây, Hà Nội	0989059933	2203205446070	Agribank	001075006093	14/05/2021	Cục Cảnh sát	Cao đẳng	B2	010115025375	10/11/2015	Sở GTVT Hà Nội	10/11/2025	B2	02-133	4/5/2020	Sở GTVT Hà Nội	"276/HĐTG\\n28/03/2025"	TN	
57	Phạm Đức Tuân	12/7/1984	Hà Tây	Nam	X1 Tòng Lệnh, Tòng Bạt, Ba Vì, Hà Nội	0964284655	0964284655	MB	001084006014	24/07/2021	Cục Cảnh sát	Đại học	B2	010041018296	27/12/2016	Sở GTVT Hà Nội	27/12/2026	B2	02-343	10/5/2021	Sở GTVT Hà Nội	"277/HĐTG\\n28/03/2025"	TN	
58	Trần Đức Tuấn	22/8/1974	Hà Nội	Nam	Thôn Vĩnh Phệ, Chu Minh, Ba Vì, Hà Nội	0988441629	9900166688868	MB	001074034357	12/08/2022	Cục Cảnh sát	Trung cấp	B2	010955008147	19/4/2017	Sở GTVT Hà Nội	19/4/2027	B2	02-348	10/5/2021	Sở GTVT Hà Nội	"278/HĐTG\\n28/03/2025"	TN	
59	Đoàn Văn Tuấn	11/3/1991	Hà Nội	Nam	Bảo Lộc 4- Võng Xuyên- Phúc Thọ- Hà Nội	0983499012	19032027633013	 Techcombank 	001091028836	10/7/2021	Cục Cảnh sát	Trung cấp	B2	010143083466	20/11/2014	Sở GTVT Hà Nội	20/11/2034	B2	02-396	14/11/2023	Sở GTVT Hà Nội	"279/HĐTG\\n28/03/2025"	TN	
60	Nguyễn Bá Tuyên	3/12/1987	Hà Nội	Nam	Thôn Đài Hoa, Thị trấn Tây Đằng, Ba Vì, Hà Nội	0977875646	8826831222	BIDV	001087038464	25/04/2021	Cục Cảnh sát	Trung cấp	E	010071009923	21/10/2019	Sở GTVT Hà Nội	21/10/2034	B2	02-01	30/10/2015	Sở GTVT Hà Nội	"280/HĐTG\\n28/03/2025"	TN	
61	Trần Thanh Tuyền	10/11/1988	Hà Nội	Nam	Quang Ngọc- Vạn Thắng- Ba Vì- Hà Nội	0972009088	8290107504009	 MB 	001088005376	24/6/2021	Cục Cảnh sát	Trung cấp	B2	010060017771	13/12/2017	Sở GTVT Hà Nội	13/12/2027	B2	02-370	28/3/2022	Sở GTVT Hà Nội	"281/HĐTG\\n28/03/2025"	TN	
62	Phùng Văn Ủy	20/3/1974	Hà Nội	Nam	Vân Trai, Tây Đằng, Ba Vì, Hà Nội	0974165665	4511164438	BIDV	001074023100	24/7/2021	Cục Cảnh sát	Trung cấp	E	010113004574	8/7/2019	Sở GTVT Hà Nội	8/7/2024	C	5191	24/8/2011	Sở GTVT Hà Nội	"282/HĐTG\\n28/03/2025"	TN	
63	Khuất Hữu Vân	12/2/1992	Hà Nội	Nam	Thôn Bướm- Thọ Lôc- Phúc Thọ- Hà Nội	0967046899	4510806597	 BIDV 	001092018104	22/8/2023	Cục Cảnh sát	Trung cấp	C	010173016584	4/10/2022	Sở GTVT Hà Nội	4/10/2027	B2	02-397	14/11/2023	Sở GTVT Hà Nội	"328/HĐTG\\n28/03/2025"	TN	
64	Nguyễn Đại Việt	16/6/1983	Hà Nội	Nam	Tây Đằng, Ba Vì, Hà Nội	0985943232	4510732276	BIDV	001083058586	25/07/2021	Cục Cảnh sát	Trung cấp	FC	9904151994826	12/6/2016	Sở GTVT Vĩnh Phúc	22/4/2026	B2	3566	30/12/2009	Sở GTVT Hà Nội	"283/HĐTG\\n28/03/2025"	TN	
65	Đào Thế Việt	26/12/1972	Hà Nội	Nam	Hậu Trạch- Vạn Thắng- Ba Vì- Hà Nội	0962421886	90962421886	 MB 	001072013191	24/08/2021	Cục Cảnh sát	Trung cấp	B2	010144025957	14/8/2014	Sở GTVT Hà Nội	14/8/2034	B2	02-240	4/5/2020	Sở GTVT Hà Nội	"284/HĐTG\\n28/03/2025"	TN	
66	Nguyễn Như Hà	21/9/1980	Hà Nội	Nam	56A TT Chùa Mới- Ngô Quyền- Sơn Tây- Hà Nội	0903210980	2369566669	 TechcombanK 	001080024221	24/8/2021	Cục Cảnh sát	Trung cấp	B2	010138046742	16/10/2023	Sở GTVT Hà Nội	16/10/2033	B2	02-399	4/6/2024	Sở GTVT Hà Nội	"285/HĐTG\\n28/03/2025"	TN	
67	Đào Thế Duy	10/9/2000	Hà Nội	Nam	Hậu Trạch- Vạn Thắng- Ba Vì- Hà Nội	0355238883	0355238883	TPbanK	001200034560	07/11/2021	Cục Cảnh sát	Trung cấp	B2	010205132790	17/12/2020	Sở GTVT Hà Nội	17/12/2030	B2	02-398	4/6/2024	Sở GTVT Hà Nội	"286/HĐTG\\n28/03/2025"	TN	
68	Khuất Duy Hải	19/11/1991	Hà Tây	Nam	Tổ 6- Thị trấn Phúc Thọ- Phúc Thọ- Hà Nội	0982541565	296198599999	 TechombanK 	001091006473	8/11/2022	Cục Cảnh sát	Cao đẳng	B2	010155090621	27/11/2015	Sở GTVT Hà Nội	27/11/2025	B2	02-268	10/5/2021	Sở GTVT Hà Nội	"287/HĐTG\\n28/03/2025"	TN	
69	Vũ Quang Hòa	16/1/1990	Hà Nội	Nam	Bãi Chạo, Tú Sơn, Kim Bôi, Hòa Bình	0977580878	2200601488	BIDV	017090008556	02/07/2021	Cục Cảnh sát	ĐHSPHN	B2	010129026061	5/9/2016	Sở GTVT Hà Nội	5/9/2026	B2	02-15	11/10/2016	Sở GTVT Hà Nội	"288/HĐTG\\n28/03/2025"	TN	
70	Phùng Hữu Sơn	29/11/1987	Hà Nội	Nam	Xóm Đẵm, Vật Lại 3- Vật Lại- Ba Vì- Hà Nội	0948898499	19034465159017	 Tecombank 	001087039048	15/4/2021	Cục Cảnh sát	Trung cấp	D	010088011890	19/9/2023	Sở GTVT Hà Nội	19/9/2028	B2	02-415	23/12/2024	Sở GTVT Hà Nội	"291/HĐTG\\n28/03/2025"	TN	
71	Nguyễn Thành Trung	20/2/2002	Hà Nội	Nam	Tổ 4- Mai Trai- Trung Hưng- Sơn Tây- Hà Nội	0986973133	230119702002	MB	001202035466	19/8/2021	Cục Cảnh sát	Trung cấp	B2	010203127091	7/12/2020	Sở GTVT Hà Nội	7/12/2030	B2	02-416	23/12/2024	Sở GTVT Hà Nội	"290/HĐTG\\n28/03/2025"	TN	
72	Nguyễn Việt Cường	8/1/1988	Hà Nội	Nam	SN 63-b Thôn 1- Tích Giang- Phúc Thọ- Hà Nội	0974637589	107882688158	ViettinBank	001088024698	15/9/2024	Bộ Công an	Trung cấp	B2	010124017237	10/12/2015	Sở GTVT Hà Nội	10/12/2025	B2	435/2018	6/4/2018	Sở GTVT Hồ Chí Minh	"289/HĐTG\\n28/03/2025"	TN	
73	Nguyễn Văn Anh	16/12/1965	Hà Tây	Nam	Yên Bài- Ba Vì- Hà Nội	0966706544	19033104609011	 TechcombanK 	001065032165	24/7/2021	Cục Cảnh sát	Đại học	B2	010050002570	17/5/2023	Sở GTVT Hà Nội	17/5/2023	B2	02-140	4/5/2020	Sở GTVT Hà Nội	"292/HĐTG\\n28/03/2025"	BB	Đơn vị khác
74	Phùng Thị Minh Hồng	23/10/1978	Hà Tây	Nữ	Đông Phong- Tiên Phong- Ba Vì- Hà Nội	0977875366	62201987778	 MB 	001178022496	10/5/2021	Cục Cảnh sát	Đại học	B2	011140018301	16/5/2014	Sở GTVT Hà Nội	16/5/2024	B2	02-214	4/5/2020	Sở GTVT Hà Nội	"293/HĐTG\\n28/03/2025"	BB	Đơn vị khác
75	Nguyễn Việt Hùng	7/11/1975	Hà Tây	Nam	Hưng Đạo, Tây Đằng, Ba Vì, Hà Nội	0912124729	4510658938	BIDV	001075029227	16/4/2021	Cục Cảnh sát	Trung cấp	E	010061016467	18/5/2020	Sở GTVT Vĩnh Phúc	18/5/2025	C	02-65	17/5/2018	Sở GTVT Hà Nội	"294HĐTG\\n28/03/2025"	BB	Đơn vị khác
76	Nguyễn Duy Long	4/8/1988	Hà Tây	Nam	Thôn 2, Phúc Hòa, Phúc Thọ, Hà Nội	0972249981	2021881988	 Techcombank 	001088031969	26/03/2024	Cục Cảnh sát	Trung cấp	B2	010182058054	9/7/2018	Sở GTVT Hà Nội	9/7/2028	B2	02-366	28/3/2022	Sở GTVT Hà Nội	"295/HĐTG\\n28/03/2025"	BB	Đơn vị khác
77	Phạm Nguyên Ngọc	11/2/1977	Hà Tây	Nam	Thái Bạt- Tòng Bạt- Ba Vì- Hà Nội	0888707588	3331234588888	MB	001077018085	10/8/2022	Cục Cảnh sát	Đại học	C	010094033080	13/11/2019	Sở GTVT Hà Nội	13/11/2024	C	02-08	29/9/2016	Sở GTVT Hà Nội	"296/HĐTG\\n28/03/2025"	BB	Đơn vị khác
78	Cao Văn Thỏa	17/3/1985	Hà Nội	Nam	Thuần Mỹ- Trạch Mỹ Lộc- Phúc Thọ- Hà Nội	0904276994	4015365078	MB	001085039791	24/4/2021	Cục Cảnh sát	Đại học	B2	010111055675	18/1/2017	Sở GTVT Hà Nội	18/1/2027	B2	02-197	4/5/2020	Sở GTVT Hà Nội	"297/HĐTG\\n28/03/2025"	BB	Đơn vị khác
79	Hoàng Minh Tuấn	23/1/1980	Hà Tây	Nữ	Cam Đà- Cam Thượng- Ba Vì- Hà Nội	0982231581	0982231581	MB	001080022362	24/7/2021	Cục Cảnh sát	Đại học	B2	010164115630	21/12/2016	Sở GTVT Hà Nội	21/12/2026	B2	02-205	4/5/2020	Sở GTVT Hà Nội	"298/HĐTG\\n28/03/2025"	BB	Đơn vị khác
80	Lê Quang Tuấn	16/2/1984	Hà Nội	Nam	Võng Xuyên- Phúc Thọ- Hà Nội	0983928951	2212205099500	Agribank	001084045418	30/4/2021	Cục Cảnh sát	Trung cấp	B2	010142001816	25/12/2023	Sở GTVT Hà Nội	25/12/2033	B2	02-345	10/5/2021	Sở GTVT Hà Nội	"299/HĐTG\\n28/03/2025"	BB	Đơn vị khác
81	Nguyễn Vũ Quang	27/11/1986	Hà Tây	Nam	Liễu Đông- Thụy An- Ba Vì- Hà Nội	0914952686	4510327690	BIDV	001086017901	10/4/2017	Cục Cảnh sát	Trung cấp	D	010067013781	12/10/2020	Sở GTVT Hà Nội	12/10/2025	B2	4157	14/5/2010	Sở GTVT Hà Nội	"300/HĐTG\\n28/03/2025"	BB	Đơn vị khác
82	Nguyễn Tiến Hà	24/7/1984	Hà Tây	Nam	Phú Xuyên 2- Phú Châu- Ba Vì- Hà Nội	0865362332	0865362332	 MB 	001084043993	25/4/2021	Cục Cảnh sát	Trung cấp	B2	010149036158	19/3/2024	Sở GTVT Hà Nội	19/3/2034	B2	02-400	4/6/2024	Sở GTVT Hà Nội	"301/HĐTG\\n28/03/2025"	BB	Đơn vị khác
83	Nguyễn Thịnh	4/9/1984	Hà Tây	Nam	Khu 15- Đông Phong- Tiên Phong- Ba Vì- Hà Nội	0968018138	4510192232	BIDV	017084000309	10/05/2021	Cục Cảnh sát	Đại học	B2	010076005111	28/6/2023	Sở GTVT Hà Nội	28/6/2033	B2	5178	24/8/2011	Sở GTVT Hà Nội	"318/HĐTG\\n28/03/2025"	BB	Đơn vị khác
84	Khuất Văn Truyền	22/11/1974	Hà Nội	Nam	Thôn Trung Nam Lộc- Thọ Lộc- Phúc Thọ- Hà Nội	0366355866	4510192889	 BIDV 	001074039668	10/7/2021	Cục Cảnh sát	Trung cấp	E	010067014753	31/12/2024	Sở GTVT Hà Nội	22/11/2029	E	02-13	29/9/2016	Sở GTVT Hà Nội	"327/HĐTG\\n28/03/2025"	BB	Đơn vị khác
85	Lê Trí Bách	19/12/1965	Hà Nội	Nam	170 Đường Xuân Khanh- Xuân Khanh- Sơn Tây- Hà Nội	0912244990	8300101127004	 MB 	001065017720	20/03/2020	Cục Cảnh sát	Trung cấp	D	010037025970	18/12/2020	Sở GTVT Hà Nội	18/12/2025	C	01-03	21/10/2015	Sở GTVT Hà Nội	"302/HĐTG\\n28/03/2025"	BB	Hưu trí
86	Lê Hồng Chung	10/11/1965	Hà Nội	Nam	Phú Mai, Phú Thịnh, Sơn Tây, Hà Nội	0963793063	4510191910	BIDV	001065002583	21/07/2022	Cục Cảnh sát	Trung cấp	E	010963006795	17/11/2020	Sở GTVT Hà Nội	17/11/2025	D	02-50	17/5/2018	Sở GTVT Hà Nội	"303/HĐTG\\n28/03/2025"	BB	Hưu trí
87	Ngô Văn Cúc	1/1/1957	Hà Nội	Nam	Thụy Phiêu- Thụy An- Ba Vì- Hà Nội	0984933309	00119926666	MB	001057001815	07/05/2022	Cục Cảnh sát	Trung cấp	D	010954011610	5/6/2020	Sở GTVT Hà Nội	05/6/2025	D	02-53	17/5/2018	Sở GTVT Hà Nội	"304/HĐTG\\n28/03/2025"	BB	Hưu trí
88	Dương Đức Cường	3/5/1956	Hải Dương	Nam	P3- Nhà A TTXN Thượng Đình- Thanh Xuân- Hà Nội	0912179083	256325322	VPBank	033056000856	1/5/2021	Cục Cảnh sát	Đại học	B2	010052000358	14/11/2022	Sở GTVT Hà Nội	14/11/2032	B2	259	24/7/2008	Sở GTVT Hà Tây	"305/HĐTG\\n28/03/2025"	BB	Hưu trí
89	Lê Mạnh Hà	1/1/1962	Hà Tây	Nam	Số 51- Phố Cùng- Phú Thịnh- Sơn Tây- Hà Nội	0982541961	03371885801	TPBanK	001062026847	15/4/2021	Cục Cảnh sát	Cao đẳng	C	010036009067	05/03/2003	Sở GTVT Hà Nội	03/02/2025	C	02-62	17/5/2018	Sở GTVT Hà Tây	"306/HĐTG\\n28/03/2025"	BB	Hưu trí
90	Phùng Viết Hải	30/8/1964	Hà Tây	Nam	Ngõ 66- Xuân Khanh- Sơn Tây- Hà Nội	0986221864	8300100995002	MB	001064023513	16/04/2021	Cục Cảnh sát	Đại học	C	010895000809	19/11/2018	Sở GTVT Hà Nội	3/11/2028	B2	02-155	4/5/2020	Sở GTVT Hà Nội	"307/HĐTG\\n28/03/2025"	BB	Hưu trí
91	Phùng Kim Khương	16/11/1962	Hà Nội	Nam	Tây Đằng, Ba Vì, Hà Nội	0973637947	4510 192047	BIDV	001062012234	24/7/2021	Cục Cảnh sát	Đại học	B2	010068006807	28/5/2014	Sở GTVT Hà Nội	28/5/2034	B2	5614	31/12/2018	Sở GTVT Hà Nội	"308/HĐTG\\n28/03/2025"	BB	Hưu trí
92	Nguyễn Ngọc Kiểm	2/8/1960	Hà Tây	Nam	Khu phố La Thành, Viên Sơn, Sơn Tây, Hà Nội	0335828625	2203205509112	Agribank	001060015359	02/08/2021	Cục Cảnh sát	Trung cấp	B2	010069007258	10/6/2014		10/6/2034	B2	4216	14/5/2010	Sở GTVT Hà Nội	"309/HĐTG\\n28/03/2025"	BB	Hưu trí
93	Đỗ Hoàng Long	4/7/1975	Hà Tây	Nam	Áng Gạo- Thụy An- Ba Vì- Hà Nội	0989991771	2601198824	 BIDV 	001075020456	20/07/2021	Cục Cảnh sát	Cao đẳng	B2	010151090609	27/11/2015	Sở GTVT Hà Nội	27/11/2025	B2	02-124	4/5/2020	Sở GTVT Hà Nội	"310/HĐTG\\n28/03/2025"	BB	Hưu trí
94	Đặng Đình Luân	16/8/1960	Hưng Yên	Nam	Tân Phú- Sơn Đông- Sơn Tây- Hà Nội	0984589178	8300111846009	MB	033060010011	14/12/2021	Cục Cảnh sát	Đại học	B2	010164037169	18/5/2016	Sở GTVT Hà Nội	19/5/2026	B2	02-168	4/5/2020	Sở GTVT Hà Nội	"311/HĐTG\\n28/03/2025"	BB	Hưu trí
95	Nguyễn Khắc Nguyên	2/9/1971	Hà Tây	Nam	Kim Bí- Tiên Phong- Ba Vì- Hà Nội	0964617799	6888619718888	MB	001071004814	10/5/2021	Cục Cảnh sát	Đại học	C	010059016259	27/7/2020	Sở GTVT Hà Nội	27/7/2025	B2	02-392	14/11/2023	Sở GTVT Hà Nội	"312/HĐTG\\n28/03/2025"	BB	Hưu trí
96	Trần Văn Soan	3/1/1956	Nghệ An	Nam	266 Lê Lợi, Lê Lợi, Sơn Tây, Hà Nội	0397335408	55555568681956	Techcombak	001056004309	29/04/2021	Cục Cảnh sát	Trung cấp	D	010043010926	11/4/2023	Sở GTVT Vĩnh Phúc	11/4/2028	B2	02-75	17/5/2018	Sở GTVT Hà Nội	"313/HĐTG\\n28/03/2025"	BB	Hưu trí
97	Đặng Hùng Sơn	14/3/1961	Hà Tây	Nam	SN 11- Sơn Lộc- Trung Sơn Trầm- Sơn Tây	0384902414	0912870966	 MB 	001061019027	16/11/2022	Cục Cảnh sát	Cao đẳng	C	010965004771	15/7/2020	Sở GTVT Hà Nội	15/7/2025	C	Feb-76	17/5/2018	Sở GTVT Hà Tây	"314/HĐTG\\n28/03/2025"	BB	Hưu trí
98	Trần Quý Sử	20/9/1963	Thái Bình	Nam	Áng Đông- Thụy An- Ba Vì- Hà Nội	0346145963	8801420880	BIDV	034063013914	24/7/2021	Cục Cảnh sát	Trung cấp	C	010873000575	22/11/2021	Sở GTVT Hà Nội	22/11/2026	C	3560	30/12/2009	Sở GTVT Hà Nội	"315/HĐTG\\n28/03/2025"	BB	Hưu trí
99	Trần Hồng Thanh	12/4/1964	Hà Nam	Nam	5/3 Tùng Thiện- Sơn Lộc- Sơn Tây- Hà Nội	0989398676	4510424829	 BIDV 	035064004087	29/4/2021	Cục Cảnh sát	Đại học	B2	010106023045	27/2/2015	Sở GTVT Hà Nội	27/2/2025	B2	02-191	04/5/2020	Sở GTVT Hà Nội	"316/HĐTG\\n28/03/2025"	BB	Hưu trí
100	Nguyễn Văn Thi	10/11/1960	Hà Nội	Nam	Thụy An- Ba Vì- Hà Nội	0385036229	0914468365	VPBanK	001060016938	24/07/2021	Cục Cảnh sát	Trung cấp	B2	010915000662	10/10/1991		05/02/2030	C	02-82	17/5/2018	Sở GTVT Hà Nội	"317/HĐTG\\n28/03/2025"	BB	Hưu trí
101	Nguyễn Thái Thịnh	15/8/1960	Hà Nội	Nam	Đông Phong- Tiên Phong- Ba Vì- Hà Nội	0963968186	99915081960	 TPBank 	001060013732	10/5/2021	Cục Cảnh sát	Trung cấp	D	010078002657	24/2/2021	Sở GTVT Hà Nội	24/2/2026	B2	4004	7/4/2010	Sở GTVT Hà Nội	"319/HĐTG\\n28/03/2025"	BB	Hưu trí
102	Khiếu Dũng Tiến	14/12/1962	Lào Cao	Nam	46 Ngõ Phố Hàng- Phú Thịnh- Sơn Tây- Hà Nội	0888789497	07514121962	TPBanK	034062004463	25/4/2021	Cục Cảnh sát	Đại học	C	010993002912	13/3/2020	Sở GTVT Hà Nội	13/3/2025	C	02-83	17/5/2018	Sở GTVT Hà Nội	"320/HĐTG\\n28/03/2025"	BB	Hưu trí
103	Đoàn Công Tình	13/5/1958	Hà Tây	Nam	Kim Trung, Kim Sơn, Sơn Tây, Hà Nội	0376185074	0111557804	Đông á banK	001058010633	10/07/2021	Cục Cảnh sát	Cao đẳng	B2	010068008193	12/12/2017	Sở GTVT Hà Nội	12/12/2027	B2	5362	13/9/2011	Sở GTVT Hà Nội	"321/HĐTG\\n28/03/2025"	BB	Hưu trí
104	Nguyễn Đức Toàn	14/04/1968	Thái Nguyên	Nam	11/18- Chùa Thông- Sơn Lộc- Sơn Tây- Hà Nội	0971439129	8300122418009	MB	019068000005	10/08/2020	Cục Cảnh sát	Đại học	B2	010089013132	23/8/2013	Sở GT Hà Nội	23/8/2023	B2	02-336	10/5/2021	Sở GT Hà Nội	"322/HĐTG\\n28/03/2025"	BB	Hưu trí
105	Đỗ Văn Tuấn	15/2/1961	Hà Nội	Nam	25/29 đường 32, Phú Thịnh, Sơn Tây, Hà Nội	0965460261	4510428052	BIDV	001061001188	10/10/2021	Cục Cảnh sát	Đại học	B2	010139039624	28/12/2016	Sở GTVT Hà Nội	28/12/2026	B2	02-204	4/5/2020	Sở GTVT Hà Nội	"323/HĐTG\\n28/03/2025"	BB	Hưu trí
106	Nguyễn Ngọc Phương	6/6/1969	Hà Nội	Nam	Thanh Tiến- Thanh Mỹ- Sơn Tây- Hà Nội	0386996969	0386996969	 Vpbank 	001069014753	29/5/2021	Cục Cảnh sát	Thạc sĩ	B2	010067010487	03/09/2014	Sở GTVT Hà Nội	26/8/2034	B2	02-403	4/6/2024	Sở GTVT Hà Nội	"324/HĐTG\\n28/03/2025"	BB	Hưu trí
107	Nguyễn Xuân Hồng	16/7/1972	Thái Nguyên	Nam	Số 35- Ngõ phố Hàng- Phú Thịnh- Sơn Tây- Hà Nội	0982475002	19034337991011	 Tecombank 	019072000127	10/7/2021	Cục Cảnh sát	Trung cấp	E	010120210751	23/12/2021	Sở GTVT Vĩnh Phúc	23/12/2026	B2	02-402	4/6/2024	Sở GTVT Hà Nội	"326/HĐTG\\n28/03/2025"	BB	Hưu trí`;

const parseTeachersFromTSV = (tsv: string): TeacherProfile[] => {
  const lines = tsv.trim().split('\n');
  const header = lines.shift()?.split('\t');
  if (!header) return [];

  return lines.map(line => {
    const values = line.split('\t').map(v => v.trim().replace(/^"|"$/g, ''));
    return commonRowToTeacherProfile(values);
  }).filter(p => p !== null) as TeacherProfile[];
};


const parseExcelRowToTeacherProfile = (rowArray: any[]): TeacherProfile | null => {
    return commonRowToTeacherProfile(rowArray);
};


// --- Sample Data & Simulated Load ---
const initialTeachers: TeacherProfile[] = parseTeachersFromTSV(tsvData);

async function loadInitialData(): Promise<TeacherProfile[]> {
  // console.log(`Simulating initial data loading. ${initialTeachers.length} teachers parsed from TSV.`);
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(initialTeachers);
    }, 100); 
  });
}

// --- Helper Components ---
const Icon: React.FC<{ class: string; text?: string; srText?: string }> = ({ class: iconClass, text, srText }) => (
  <>
    <i className={`${iconClass} mr-2 text-blue-500 icon-text-align`} aria-hidden="true"></i>
    {text && <span className="font-semibold">{text}: </span>}
    {srText && <span className="sr-only">{srText}</span>}
  </>
);

const InfoField: React.FC<{ iconClass: string; label: string; value?: string | boolean | null; children?: React.ReactNode }> = ({ iconClass, label, value, children }) => {
  if (value === null || value === undefined || value === '' && !children) return null;

  let displayValue: React.ReactNode = children || value;
  if (typeof value === 'boolean') {
    displayValue = value ? 'Có' : 'Không';
  }
  if (value === 'N/A' && !children) {
    displayValue = <span className="text-gray-500">N/A</span>;
  }

  return (
    <div className="py-1">
      <Icon class={iconClass} text={label} />
      <span>{displayValue}</span>
    </div>
  );
};

const Section: React.FC<{ title: string; iconClass: string; children: React.ReactNode }> = ({ title, iconClass, children }) => (
  <div className="mb-6 p-4 border border-gray-200 rounded-lg shadow-sm bg-white">
    <h3 className="text-lg font-semibold text-blue-700 mb-3 border-b pb-2">
      <Icon class={iconClass} />{title}
    </h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {children}
    </div>
  </div>
);


// --- Main Components ---
const Header: React.FC<{ isLoggedIn: boolean; onLogout: () => void }> = ({ isLoggedIn, onLogout }) => (
  <header className="bg-blue-600 text-white p-4 shadow-md">
    <div className="container mx-auto flex justify-between items-center">
      <div className="flex items-center">
        <span className="text-2xl font-bold mr-3 ml-1"><i className="fas fa-car-alt"></i></span>
        <h1 className="text-xl font-bold">Hệ Thống Quản Lý Giáo Viên Dạy Lái Xe</h1>
      </div>
      {isLoggedIn ? (
        <button 
          onClick={onLogout}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm transition-colors duration-150 flex items-center"
          aria-label="Đăng xuất"
        >
          <i className="fas fa-sign-out-alt mr-2"></i>Đăng xuất
        </button>
      ) : (
        <button className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded text-sm transition-colors duration-150 opacity-50 cursor-not-allowed" disabled>
          <i className="fas fa-sign-in-alt mr-2"></i>Đăng nhập
        </button>
      )}
    </div>
  </header>
);

const Footer: React.FC = () => (
  <footer className="bg-blue-600 text-white p-4 text-center mt-auto text-sm">
    <p>Trường Cao đẳng GTVT Trung ương 1 | Hotline hỗ trợ: 096 5299228 | Email: sonquangbavi@gmail.com</p>
    <p>&copy; {new Date().getFullYear()} - Bản quyền thuộc về Trường CĐ GTVT Trung ương 1.</p>
  </footer>
);

const ProfileDisplay: React.FC<{ teacher: TeacherProfile | null }> = ({ teacher }) => {
  if (!teacher) {
    return (
      <div className="text-center py-10 text-gray-500">
        <i className="fas fa-info-circle fa-3x mb-3"></i>
        <p>Không có thông tin giáo viên để hiển thị.</p>
        <p>Vui lòng thực hiện tìm kiếm hoặc chọn bộ lọc.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 p-4 md:p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-blue-700 mb-6 text-center">
        <Icon class="fas fa-address-book" />Hồ sơ Giáo viên: {teacher.hoTen} (STT: {teacher.stt})
      </h2>

      <Section title="Thông tin cá nhân" iconClass="fas fa-address-card">
        <InfoField iconClass="fas fa-user" label="Họ tên" value={teacher.hoTen} />
        <InfoField iconClass="fas fa-birthday-cake" label="Ngày sinh" value={teacher.ngaySinh} />
        <InfoField iconClass="fas fa-venus-mars" label="Giới tính" value={teacher.gioiTinh} />
        <InfoField iconClass="fas fa-map-marker-alt" label="Địa chỉ" value={teacher.diaChi} />
        <InfoField iconClass="fas fa-phone" label="Số điện thoại" value={teacher.soDienThoai} />
        <InfoField iconClass="fas fa-id-card" label="Số CCCD" value={teacher.soCCCD} />
        <InfoField iconClass="fas fa-calendar-check" label="Ngày cấp CCCD" value={teacher.ngayCapCCCD} />
        <InfoField iconClass="fas fa-building" label="Nơi cấp CCCD" value={teacher.noiCapCCCD} />
      </Section>

      <Section title="Hồ sơ giấy tờ" iconClass="fas fa-folder-open">
        <InfoField iconClass="fas fa-file-medical" label="Giấy khám sức khỏe" value={teacher.giayKhamSucKhoe} />
        <InfoField iconClass="fas fa-file-signature" label="Sơ yếu lý lịch" value={teacher.soYeuLyLich} />
        <InfoField iconClass="fas fa-baby" label="Bản sao khai sinh" value={teacher.banSaoKhaiSinh} />
        {teacher.giayPhepLaiXe ? (
          <InfoField iconClass="fas fa-id-card-alt" label="Giấy phép lái xe">
            Số: {teacher.giayPhepLaiXe.so || 'N/A'}, Hạng: {teacher.giayPhepLaiXe.hang || 'N/A'}, Cấp: {teacher.giayPhepLaiXe.ngayCap || 'N/A'}, Hạn: {teacher.giayPhepLaiXe.thoiHan || 'N/A'}, Nơi cấp: {teacher.giayPhepLaiXe.noiCap || 'N/A'}
          </InfoField>
        ) : <InfoField iconClass="fas fa-id-card-alt" label="Giấy phép lái xe" value="Không có thông tin" />}
        
        {teacher.bangCap.length > 0 ? teacher.bangCap.map((bc, index) => (
          <InfoField key={index} iconClass="fas fa-graduation-cap" label={`Bằng cấp ${teacher.bangCap.length > 1 ? index + 1 : ''}`}>
            {bc.loai || 'N/A'}
            {bc.nganh !== 'N/A' && ` - ${bc.nganh}`}
            {bc.truong !== 'N/A' && `, Trường: ${bc.truong}`}
            {bc.namTotNghiep !== 'N/A' && `, Năm: ${bc.namTotNghiep}`}
            {bc.hinhThucDaoTao && bc.hinhThucDaoTao !== 'N/A' ? ` (${bc.hinhThucDaoTao})` : ''}
          </InfoField>
        )) : <InfoField iconClass="fas fa-graduation-cap" label="Bằng cấp" value="Không có thông tin" />}

        {teacher.chungChiSuPhamDayNghe ? (
          <InfoField iconClass="fas fa-chalkboard-teacher" label="Chứng chỉ SP dạy nghề">
            Số: {teacher.chungChiSuPhamDayNghe.so || 'N/A'}, Cấp: {teacher.chungChiSuPhamDayNghe.ngayCap || 'N/A'}, Nơi cấp: {teacher.chungChiSuPhamDayNghe.noiCap || 'N/A'}
          </InfoField>
        ) : <InfoField iconClass="fas fa-chalkboard-teacher" label="Chứng chỉ SP dạy nghề" value="Không có thông tin" />}

        {teacher.chungChiGiaoVienDayLaiXe ? (
          <InfoField iconClass="fas fa-car-side" label="Chứng chỉ GV dạy lái xe">
            {teacher.chungChiGiaoVienDayLaiXe.ten && `${teacher.chungChiGiaoVienDayLaiXe.ten} - `}
            Số: {teacher.chungChiGiaoVienDayLaiXe.so || 'N/A'}, Cấp: {teacher.chungChiGiaoVienDayLaiXe.ngayCap || 'N/A'}, Nơi cấp: {teacher.chungChiGiaoVienDayLaiXe.noiCap || 'N/A'}
          </InfoField>
        ): <InfoField iconClass="fas fa-car-side" label="Chứng chỉ GV dạy lái xe" value="Không có thông tin" />}
      </Section>

      <Section title="Thông tin hợp đồng & BHXH" iconClass="fas fa-file-contract">
        {teacher.hopDong ? (
          <>
            <InfoField iconClass="fas fa-file-signature" label="Số hợp đồng" value={teacher.hopDong.so} />
            <InfoField iconClass="fas fa-calendar-day" label="Ngày ký HĐ" value={teacher.hopDong.ngayKy} />
            <InfoField iconClass="fas fa-calendar-times" label="Thời hạn HĐ" value={teacher.hopDong.thoiHan} />
          </>
        ) : (
          <InfoField iconClass="fas fa-file-excel" label="Tình trạng hợp đồng" value="Chưa ký hợp đồng" />
        )}
         {teacher.xe ? (
          <InfoField iconClass="fas fa-car" label="Xe phụ trách">
            Biển số: {teacher.xe.bienSo}, Chủ xe: {teacher.xe.chuXe} {teacher.xe.soXe ? `(Số xe: ${teacher.xe.soXe})` : ''}
          </InfoField>
        ) : <InfoField iconClass="fas fa-car" label="Xe phụ trách" value="Không có thông tin" /> }
        <InfoField iconClass="fas fa-shield-alt" label="Bảo hiểm xã hội" value={teacher.baoHiemXaHoi || 'Không tham gia'} />
        {teacher.ghiChu && <InfoField iconClass="fas fa-sticky-note" label="Ghi chú" value={teacher.ghiChu} />}
      </Section>
    </div>
  );
};

const LoginForm: React.FC<{ onLoginSuccess: () => void; loginError: string; setLoginError: (error: string) => void }> = ({ onLoginSuccess, loginError, setLoginError }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
      onLoginSuccess();
    } else {
      setLoginError('Tên đăng nhập hoặc mật khẩu không đúng.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl">
        <div>
          <div className="flex justify-center">
             <i className="fas fa-user-shield fa-3x text-blue-600"></i>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Đăng nhập hệ thống
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {loginError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
              <strong className="font-bold"><i className="fas fa-exclamation-triangle mr-2"></i>Lỗi! </strong>
              <span className="block sm:inline">{loginError}</span>
            </div>
          )}
          <input type="hidden" name="remember" defaultValue="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username-address" className="sr-only">Tên đăng nhập</label>
              <input
                id="username-address"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Tên đăng nhập (admin)"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setLoginError(''); }}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Mật khẩu</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Mật khẩu (admin)"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLoginError(''); }}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <i className="fas fa-lock h-5 w-5 text-blue-500 group-hover:text-blue-400" aria-hidden="true"></i>
              </span>
              Đăng nhập
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


const App: React.FC = () => {
  const [allTeachers, setAllTeachers] = useState<TeacherProfile[]>([]);
  const [displayedTeacher, setDisplayedTeacher] = useState<TeacherProfile | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');

  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    loadInitialData()
      .then(data => {
        setAllTeachers(data || []); // Ensure data is an array
        // console.log('Initial data loaded:', data ? data.length : 0, 'teachers');
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Failed to load initial teacher data:", error);
        setAllTeachers([]); // Ensure it's an empty array on error
        setIsLoading(false);
      });
  }, []);
  
  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    setLoginError('');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setDisplayedTeacher(null);
    setSearchTerm('');
    setActiveFilter('ALL');
    setNotFound(false);
    setLoginError('');
    setUploadMessage(null);
  };


  const handleSearch = useCallback(() => {
    // console.log('handleSearch called. Term:', searchTerm, 'Filter:', activeFilter);
    // console.log('Current allTeachers count:', allTeachers.length);
    // if(allTeachers.length > 0) console.log('First teacher STT for check:', allTeachers[0].stt);

    setNotFound(false);
    setUploadMessage(null); 
    if (!searchTerm.trim()) {
      setDisplayedTeacher(null);
      return;
    }

    let teachersToSearch = allTeachers;
    if (activeFilter !== 'ALL') {
      teachersToSearch = allTeachers.filter(teacher => {
        if (activeFilter === 'HAS_CONTRACT') return teacher.coHopDong;
        if (activeFilter === 'NO_CONTRACT') return !teacher.coHopDong;
        if (activeFilter === 'HAS_BHXH') return teacher.coBHXH;
        return true; // Should not happen if activeFilter is one of the defined types
      });
    }
    // console.log('Teachers to search after filter:', teachersToSearch.length);
    
    const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
    const result = teachersToSearch.find(
      teacher =>
        teacher.stt.toLowerCase() === lowerCaseSearchTerm ||
        teacher.hoTen.toLowerCase().includes(lowerCaseSearchTerm)
    );
    // console.log('Search result:', result);

    if (result) {
      setDisplayedTeacher(result);
    } else {
      setDisplayedTeacher(null);
      setNotFound(true);
    }
  }, [searchTerm, allTeachers, activeFilter]);
  
  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setUploadMessage("Không có file nào được chọn.");
      return;
    }

    setIsProcessingFile(true);
    setUploadMessage("Đang xử lý file Excel...");
    setDisplayedTeacher(null); 
    setNotFound(false);

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            throw new Error("Không đọc được nội dung file.");
          }
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const allSheetNamesInFile = workbook.SheetNames;
          
          const predefinedTargetSheetNames = ["DS CŨ", "BHXH BB+HT", "KO KÝ HĐ"];
          let sheetsToProcessActual = allSheetNamesInFile.filter(name => predefinedTargetSheetNames.includes(name));

          if (sheetsToProcessActual.length === 0) {
            // Fallback: if no specific target sheets found, process all sheets in the file.
            sheetsToProcessActual = allSheetNamesInFile;
            if (sheetsToProcessActual.length === 0) {
                 setUploadMessage("File Excel không chứa sheet nào.");
                 setIsProcessingFile(false);
                 if (fileInputRef.current) fileInputRef.current.value = "";
                 return;
            }
            // console.log("Không tìm thấy các sheet chỉ định, xử lý tất cả các sheet:", sheetsToProcessActual.join(', '));
          } else {
            // console.log("Xử lý các sheet chỉ định:", sheetsToProcessActual.join(', '));
          }


          const existingStts = new Set(allTeachers.map(t => t.stt));
          const newTeachersAccumulator: TeacherProfile[] = [];
          let totalAddedCount = 0;
          let totalSkippedCount = 0;
          let processedAnyData = false;

          for (const sheetName of sheetsToProcessActual) {
              const worksheet = workbook.Sheets[sheetName];
              if (!worksheet) continue; // Should not happen if sheetName is from workbook.SheetNames

              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

              if (jsonData.length <= 1) { // Skip header row (index 0 is header)
                  // console.log(`Sheet "${sheetName}" rỗng hoặc chỉ có tiêu đề.`);
                  continue; 
              }
              processedAnyData = true;

              for (let i = 1; i < jsonData.length; i++) { // Skip header row
                  const row = jsonData[i];
                  if (!row || row.every(cell => String(cell ?? '').trim() === '')) { 
                      continue; // Skip empty row
                  }
                  const teacherProfile = parseExcelRowToTeacherProfile(row);
                  if (teacherProfile) {
                      if (!existingStts.has(teacherProfile.stt)) {
                          newTeachersAccumulator.push(teacherProfile);
                          existingStts.add(teacherProfile.stt); // Add to set to prevent duplicates from same file processing
                          totalAddedCount++;
                      } else {
                          totalSkippedCount++;
                      }
                  } else {
                      // console.warn(`Dòng không hợp lệ hoặc thiếu STT trong sheet "${sheetName}":`, row);
                      totalSkippedCount++;
                  }
              }
          }
          
          if (!processedAnyData && sheetsToProcessActual.length > 0) {
            setUploadMessage("Các sheet được chọn/tìm thấy trong file Excel không có dữ liệu (ngoài dòng tiêu đề).");
          } else if (newTeachersAccumulator.length > 0) {
            setAllTeachers(prevTeachers => [...prevTeachers, ...newTeachersAccumulator]);
            setUploadMessage(`Cập nhật hoàn tất từ sheet: ${sheetsToProcessActual.join(', ')}. ${totalAddedCount} giáo viên được thêm. ${totalSkippedCount} giáo viên bị bỏ qua (trùng STT hoặc dữ liệu không hợp lệ).`);
          } else if (processedAnyData) {
             setUploadMessage(`Không có giáo viên mới nào được thêm từ sheet: ${sheetsToProcessActual.join(', ')}. ${totalSkippedCount} giáo viên bị bỏ qua (trùng STT hoặc dữ liệu không hợp lệ).`);
          } else { // No sheets to process initially or all were empty
             setUploadMessage("Không tìm thấy dữ liệu hợp lệ trong các sheet của file Excel.");
          }

        } catch (parseError: any) {
            console.error("Lỗi khi phân tích file Excel:", parseError);
            setUploadMessage(`Lỗi khi phân tích file Excel: ${parseError.message}. Đảm bảo file đúng định dạng và cấu trúc cột.`);
        } finally {
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.onerror = (errEvent) => {
          console.error("Lỗi khi đọc file:", errEvent);
          setUploadMessage("Lỗi khi đọc file. Vui lòng thử lại.");
          setIsProcessingFile(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
      };
      reader.readAsArrayBuffer(file);

    } catch (error: any) {
      console.error("Lỗi xử lý file:", error);
      setUploadMessage(`Lỗi xử lý file: ${error.message}`);
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  const filterOptions: { key: FilterType; label: string; icon: string }[] = [
    { key: 'ALL', label: 'Tất cả', icon: 'fas fa-list' },
    { key: 'HAS_CONTRACT', label: 'Đã ký hợp đồng', icon: 'fas fa-file-signature' },
    { key: 'NO_CONTRACT', label: 'Chưa ký hợp đồng', icon: 'fas fa-file-excel' },
    { key: 'HAS_BHXH', label: 'Tham gia BHXH', icon: 'fas fa-shield-alt' },
  ];

  if (isLoading && !isLoggedIn) { 
    return (
      <div className="flex flex-col min-h-screen bg-gray-100">
        <Header isLoggedIn={isLoggedIn} onLogout={handleLogout} />
        <main className="flex-grow container mx-auto p-6 flex items-center justify-center">
            <div className="text-center">
            <i className="fas fa-spinner fa-spin fa-3x text-blue-500"></i>
            <p className="mt-2 text-lg">Đang tải dữ liệu...</p>
            </div>
        </main>
        <Footer />
      </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <Header isLoggedIn={isLoggedIn} onLogout={handleLogout} />
      <main className="container mx-auto p-4 md:p-6 flex-grow">
        {!isLoggedIn ? (
          <LoginForm onLoginSuccess={handleLoginSuccess} loginError={loginError} setLoginError={setLoginError} />
        ) : (
          <>
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-lg mb-6">
              <div className="flex flex-col md:flex-row items-center gap-4 mb-4">
                <input
                  type="text"
                  placeholder="Nhập STT hoặc tên giáo viên..."
                  className="w-full md:flex-grow p-3 border border-gray-300 rounded-l-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={handleKeyPress}
                  aria-label="Tìm kiếm giáo viên"
                />
                <button
                  onClick={handleSearch}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-r-md font-semibold transition-colors duration-150 flex items-center justify-center"
                  aria-label="Thực hiện tìm kiếm"
                >
                  <i className="fas fa-search mr-2"></i> Tìm kiếm
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Lọc theo trạng thái:</p>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setActiveFilter(opt.key);
                        setDisplayedTeacher(null); 
                        setNotFound(false);
                        setUploadMessage(null); 
                        // Trigger search if a filter is applied and searchTerm exists
                        // if (searchTerm.trim()) {
                        //   handleSearch(); // Re-run search with new filter
                        // }
                      }}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 flex items-center
                        ${activeFilter === opt.key ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                      aria-pressed={activeFilter === opt.key}
                    >
                      <i className={`${opt.icon} mr-2`}></i> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

               {/* File Upload Section */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-md font-semibold text-gray-700 mb-2">
                  <i className="fas fa-file-excel mr-2 text-green-600"></i>Cập nhật dữ liệu từ Excel
                </h3>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="Chọn file Excel để tải lên"
                    disabled={isProcessingFile}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingFile}
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150 flex items-center justify-center disabled:bg-gray-400"
                  >
                    <i className={`mr-2 ${isProcessingFile ? 'fas fa-spinner fa-spin' : 'fas fa-upload'}`}></i>
                    {isProcessingFile ? 'Đang xử lý...' : 'Tải lên & Cập nhật'}
                  </button>
                </div>
                {uploadMessage && (
                  <p className={`mt-3 text-sm p-3 rounded-md ${uploadMessage.includes("Lỗi") || uploadMessage.includes("Không có giáo viên mới") || uploadMessage.includes("không chứa sheet") || uploadMessage.includes("không có dữ liệu") ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {uploadMessage}
                  </p>
                )}
              </div>

            </div> {/* End of controls white box */}
            
            {notFound && (
              <div className="text-center py-6 bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-md shadow">
                <i className="fas fa-exclamation-triangle fa-2x mb-2"></i>
                <p>Không tìm thấy giáo viên nào phù hợp với STT/tên "{searchTerm}" và bộ lọc "{filterOptions.find(f=>f.key === activeFilter)?.label || activeFilter}".</p>
              </div>
            )}

            <ProfileDisplay teacher={displayedTeacher} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} else {
  console.error('Root element not found');
}
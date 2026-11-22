export const TEAM_COLORS = {
  VILLAGER: { bg: 'bg-emerald-600', border: 'border-emerald-600', text: 'text-emerald-600', whiteText: 'text-white' },
  WEREWOLF: { bg: 'bg-red-600', border: 'border-red-600', text: 'text-red-600', whiteText: 'text-white' },
  MUTANT: { bg: 'bg-purple-600', border: 'border-purple-600', text: 'text-purple-600', whiteText: 'text-white' }
};

export const ROLE_COLORS = {
  'phu_thuy': { bg: 'bg-purple-700', border: 'border-purple-700', text: 'text-purple-700', whiteText: 'text-white' },
  'bao_ve': { bg: 'bg-sky-500', border: 'border-sky-500', text: 'text-sky-500', whiteText: 'text-white' },
  'tien_tri': { bg: 'bg-blue-700', border: 'border-blue-700', text: 'text-blue-700', whiteText: 'text-white' },
  'than_tinh_yeu': { bg: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-500', whiteText: 'text-white' },
  'tho_san': { bg: 'bg-amber-700', border: 'border-amber-700', text: 'text-amber-700', whiteText: 'text-white' },
  // Các chức năng khác
  'tham_tu': { bg: 'bg-teal-600', border: 'border-teal-600', text: 'text-teal-600', whiteText: 'text-white' },
  'truong_toc_gau': { bg: 'bg-orange-700', border: 'border-orange-700', text: 'text-orange-700', whiteText: 'text-white' },
  'nguyet_nu': { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-500', whiteText: 'text-white' },
  'nhan_ban': { bg: 'bg-gray-500', border: 'border-gray-500', text: 'text-gray-500', whiteText: 'text-white' },
  // Các dải màu Sói
  'soi_thuong': { bg: 'bg-red-600', border: 'border-red-600', text: 'text-red-600', whiteText: 'text-white' },
  'ke_phan_boi': { bg: 'bg-red-700', border: 'border-red-700', text: 'text-red-700', whiteText: 'text-white' },
  'soi_phap_su': { bg: 'bg-rose-600', border: 'border-rose-600', text: 'text-rose-600', whiteText: 'text-white' },
  'soi_cuong_no': { bg: 'bg-red-800', border: 'border-red-800', text: 'text-red-800', whiteText: 'text-white' },
  'soi_dau_dan': { bg: 'bg-red-950', border: 'border-red-950', text: 'text-red-950', whiteText: 'text-white' }
};

export const DEFAULT_ROLES = [
  { id: 'dan_lang', name: 'Dân Làng', team: 'VILLAGER' },
  { id: 'bao_ve', name: 'Bảo Vệ', team: 'VILLAGER' },
  { id: 'phu_thuy', name: 'Phù Thủy', team: 'VILLAGER' },
  { id: 'tien_tri', name: 'Tiên Tri', team: 'VILLAGER' },
  { id: 'tham_tu', name: 'Thám Tử', team: 'VILLAGER' },
  { id: 'truong_toc_gau', name: 'Trưởng Tộc Gấu', team: 'VILLAGER' },
  { id: 'nguyet_nu', name: 'Nguyệt Nữ', team: 'VILLAGER' },
  { id: 'tho_san', name: 'Thợ Săn', team: 'VILLAGER' },
  { id: 'nhan_ban', name: 'Nhân Bản', team: 'VILLAGER' },
  { id: 'soi_thuong', name: 'Sói Thường', team: 'WEREWOLF' },
  { id: 'ke_phan_boi', name: 'Kẻ Phản Bội', team: 'WEREWOLF' },
  { id: 'soi_phap_su', name: 'Sói Pháp Sư', team: 'WEREWOLF' },
  { id: 'soi_cuong_no', name: 'Sói Cuồng Nộ', team: 'WEREWOLF' },
  { id: 'soi_dau_dan', name: 'Sói Đầu Đàn', team: 'WEREWOLF' },
  { id: 'thang_ngoc', name: 'Thằng Ngốc', team: 'MUTANT' },
  { id: 'ke_bi_nguyen', name: 'Kẻ Bị Nguyền', team: 'MUTANT' },
  { id: 'than_tinh_yeu', name: 'Thần Tình Yêu', team: 'MUTANT' },
];

export const NIGHT_ORDER = [
  'than_tinh_yeu',
  'nhan_ban',
  'nguyet_nu',
  'ke_bi_nguyen',
  'soi_cuong_no',
  'soi_dau_dan',
  'ke_phan_boi',
  'soi_phap_su',
  'soi_thuong',
  'bao_ve',
  'tien_tri',
  'tham_tu',
  'truong_toc_gau',
  'phu_thuy',
  'tho_san'
];

export function getRoleColor(roleId, team) {
  if (ROLE_COLORS[roleId]) return ROLE_COLORS[roleId];
  if (TEAM_COLORS[team]) return TEAM_COLORS[team];
  return { bg: 'bg-gray-600', border: 'border-gray-600', text: 'text-gray-600', whiteText: 'text-white' };
}

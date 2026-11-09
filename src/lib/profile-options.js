export const GENDER_OPTIONS = [
  { value: '', label: '未设置' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
  { value: 'secret', label: '保密' }
];

// 移动端性别面板只提供「男 / 女」（设计 182:872，没有「未设置」行）；
// 已有的空值 / other / secret 仍由 GENDER_OPTIONS 回显，页面对空值显示「请选择性别」占位。
export const MOBILE_GENDER_OPTIONS = GENDER_OPTIONS.filter((item) => ['male', 'female'].includes(item.value));

export const IDENTITY_OPTIONS = [
  { value: '', label: '未设置' },
  { value: 'secondary', label: '中学生' },
  { value: 'college', label: '大学生' },
  { value: 'graduate', label: '研究生' },
  { value: 'working', label: '已工作' },
  { value: 'other', label: '其他' }
];

export function optionLabel(options, value) {
  return options.find((item) => item.value === (value || ''))?.label || '未设置';
}

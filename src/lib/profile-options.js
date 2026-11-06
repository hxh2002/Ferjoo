export const GENDER_OPTIONS = [
  { value: '', label: '未设置' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
  { value: 'secret', label: '保密' }
];

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

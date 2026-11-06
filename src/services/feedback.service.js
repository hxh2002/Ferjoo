// 意见反馈还没有提交接口。调用方必须把失败展示出来，不能写成已提交。
export async function submitFeedback() {
  throw new Error('暂时无法提交，请稍后再试。');
}

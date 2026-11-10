// 换绑前的确认文案：link_starter_device 只结束「该酵种的活跃关联」，不影响同设备的其他酵种。
// 保留原有返回结构，供已有的换绑流程复用。
import { currentLink } from './starter-link-windows.js';

/**
 * @param {{ links: any[], starterId: string, deviceId: string, starterName?: string, deviceName?: string,
 *   starterNameOf?: (id: string) => string, deviceNameOf?: (id: string) => string, roundActive?: (starterId: string) => boolean }} options
 * @returns {null | { message: string, lines: string[], occupantStarterId: string | null, ownDeviceId: string | null, roundStarterIds: string[] }}
 *   null 表示不会影响任何已有关联（无需确认）。
 */
export function describeLinkChange({ links, starterId, deviceId, starterName = '该酵种', deviceName = '该设备', starterNameOf = () => '另一个酵种', deviceNameOf = () => '另一台设备', roundActive = () => false }) {
  const own = currentLink(links, starterId);
  if (own?.device_id === deviceId) return null;
  const lines = [];
  if (own) {
    lines.push(`「${starterName}」目前关联着设备「${deviceNameOf(own.device_id)}」，确认后会结束这段关联；历史记录会保留。`);
  }
  const roundStarterIds = [starterId].filter((id) => id && roundActive(id));
  for (const id of roundStarterIds) {
    const name = id === starterId ? starterName : starterNameOf(id);
    lines.push(`酵种「${name}」有进行中的发酵轮次：换绑期间没有设备读数，这一轮的曲线会出现缺口；重新关联同一台设备后缺口以外的数据会合并显示。`);
  }
  if (!own) return null;
  return { message: lines.join('\n'), lines, occupantStarterId: null, ownDeviceId: own.device_id || null, roundStarterIds };
}

export const LOCAL_LINK_NOTICE = '服务端尚未启用设备关联功能（数据库迁移未执行），这次关联只保存在当前浏览器，换设备或清除数据后会丢失，也无法用于云端历史读取。';

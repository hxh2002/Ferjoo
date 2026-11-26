import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { isMobilePath } from '../src/lib/accountNavigation.js';
import { adminNavItems, desktopNavItems } from '../src/lib/desktop-nav.js';
import {
  canChangeRole,
  closureDetailLabel,
  devicePresence,
  formatRatio,
  ilikeTerm,
  isAdminProfile,
  isSuperAdminProfile,
  memberRoleLabel,
  personLabel,
  roleLabel,
  roundStatus,
  adminErrorMessage,
  DEVICE_ONLINE_MS
} from '../src/lib/admin-access.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = (file) => {
  const { descriptor, errors } = parse(read(file));
  assert.deepEqual(errors, [], `${file} parses`);
  const script = compileScript(descriptor, { id: file });
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, [], `${file} template compiles`);
};

const actor = { id: 'super', role: 'A', is_super_admin: true };
const admin = { id: 'admin', role: 'A', is_super_admin: false };
const user = { id: 'user', role: 'U', is_super_admin: false };

assert.equal(isAdminProfile(admin), true);
assert.equal(isAdminProfile(user), false);
assert.equal(isSuperAdminProfile(actor), true);
assert.equal(isSuperAdminProfile(admin), false);
assert.equal(isSuperAdminProfile({ role: 'U', is_super_admin: true }), false);
assert.equal(roleLabel(actor), '首位管理员');
assert.equal(roleLabel(admin), '管理员');
assert.equal(roleLabel(user), '用户');
assert.equal(canChangeRole(actor, user), true);
assert.equal(canChangeRole(actor, admin), true);
assert.equal(canChangeRole(actor, actor), false);
assert.equal(canChangeRole(admin, user), false);
assert.equal(canChangeRole(actor, { ...actor, id: 'other-super' }), false);
assert.equal(personLabel({ display_name: '阿禾', system_user_id: 'U1' }), '阿禾');
assert.equal(personLabel(null), '未知账号');
assert.equal(memberRoleLabel('owner'), '所有者');
assert.equal(memberRoleLabel('member'), '成员');
assert.equal(formatRatio('deep_reset'), '大比例刷新');
assert.equal(formatRatio('1:2:2'), '1:2:2');
assert.deepEqual(roundStatus({ ended_at: '2026-01-01T00:00:00Z', reason: 'auto' }), { key: 'closed', label: '已结束', source: '自动结束' });
assert.deepEqual(roundStatus({ next_feeding_at: '2026-01-02T00:00:00Z' }), { key: 'closed', label: '已结束', source: '下一次喂养' });
assert.deepEqual(roundStatus({}), { key: 'active', label: '进行中', source: '' });
assert.equal(closureDetailLabel('fallen'), '峰值后回落');
assert.equal(devicePresence(null), 'never');
assert.equal(devicePresence(new Date(Date.now() - DEVICE_ONLINE_MS - 1000).toISOString()), 'offline');
assert.equal(devicePresence(new Date().toISOString()), 'online');
assert.equal(ilikeTerm('a%,_()'), 'a');
assert.match(adminErrorMessage({ code: 'PGRST202', message: 'admin_overview' }), /033_admin_console/);
assert.match(adminErrorMessage({ message: 'FORBIDDEN' }), /没有执行这个操作的权限/);
assert.match(adminErrorMessage({ message: 'CANNOT_CHANGE_SUPER_ADMIN' }), /首位管理员/);
assert.match(adminErrorMessage({ message: 'EMAIL_TAKEN' }), /已经注册/);
assert.match(adminErrorMessage({ code: 'PGRST205', message: "Could not find the table 'public.welcome_inquiries'" }), /034_welcome_inquiries/);

assert.deepEqual(desktopNavItems.map((item) => item.label), ['设备', '日记', '酵种医生', '诊断记录', '记录喂养', '设备绑定', '我的']);
assert.equal(desktopNavItems.some((item) => item.label === '后台'), false);
assert.deepEqual(adminNavItems.map((item) => item.label), ['概览', '用户与权限', '绑定关系', '发酵轮次', '设备', '养护与反馈', '埋点观察']);
assert.equal(isMobilePath('/admin'), true);
assert.equal(isMobilePath('/admin/users'), true);
assert.match(read('src/main.js'), /isMobilePath/);

const router = read('src/router/index.js');
assert.match(router, /requiresAdmin: true/);
assert.match(router, /profile\.value\?\.role !== 'A'/);
assert.match(router, /name: 'admin-users'/);
assert.match(router, /name: 'admin-bindings'/);
assert.match(router, /name: 'admin-rounds'/);
assert.match(router, /name: 'admin-devices'/);
assert.match(router, /name: 'admin-care'/);
assert.match(router, /name: 'admin-analytics'/);
const nav = read('src/components/DesktopNav.vue');
assert.match(nav, /role === 'A'/);
assert.match(nav, /后台/);
assert.match(nav, /isAdmin && !inAdmin/);
assert.doesNotMatch(read('src/components/MobileShell.vue'), /后台/);
assert.doesNotMatch(read('src/views/mobile/MobileMe.vue'), /后台/);

const layout = read('src/views/admin/AdminLayout.vue');
assert.match(layout, /class="admin-sections"/, 'narrow screens keep section links in the page');
assert.doesNotMatch(layout, />返回</, 'the page does not repeat the shell back control');
const adminCss = read('src/assets/admin.css');
assert.match(adminCss, /\.mobile-area \.admin-console \{[^}]*display: flex/);
assert.match(adminCss, /min-width: 768px\) \{\s*\.mobile-area \.admin-console \{ max-width: 1280px/);
assert.match(adminCss, /\.mobile-area \.admin-sections \{ display: none; \}/);
assert.match(adminCss, /\.mobile-area \.admin-drawer-layer \{ left: var\(--desktop-sidebar\); \}/);
assert.match(adminCss, /\.admin-console :is\(button, \.admin-sections a\) \{ white-space: nowrap/, 'admin actions keep their labels on one line');
assert.match(adminCss, /\.admin-row-action \{[^}]*height: auto/, 'row actions grow with the label instead of clipping it');
assert.doesNotMatch(adminCss, /admin-subnav/);
assert.doesNotMatch(read('src/assets/desktop.css'), /admin-console|admin-drawer|admin-subnav/);
for (const file of ['src/views/admin/AdminUsers.vue', 'src/views/admin/AdminBindings.vue', 'src/views/admin/AdminRounds.vue', 'src/views/admin/AdminDevices.vue', 'src/views/admin/AdminCare.vue']) {
  assert.match(read(file), /admin-row-action/, `${file} uses compact row actions`);
  assert.doesNotMatch(read(file), /class="m-secondary"[^>]*>查看/, `${file} does not put a mobile CTA in the table`);
}

const migration = read('supabase/migrations/033_admin_console.sql');
assert.match(migration, /is_super_admin boolean not null default false/);
assert.match(migration, /private\.designate_super_admin/);
assert.match(migration, /revoke all on function private\.designate_super_admin\(text\) from public, anon, authenticated/);
assert.match(migration, /if not private\.is_super_admin\(\)/);
assert.match(migration, /created_by_admin/);
assert.match(migration, /CANNOT_CHANGE_SELF/);
assert.match(migration, /CANNOT_CHANGE_SUPER_ADMIN/);
assert.match(migration, /admin_create_account/);
assert.match(migration, /insert into auth\.users/);
assert.match(migration, /grant update \(name\) on table public\.devices to authenticated/);
assert.doesNotMatch(migration, /password\s*=\s*'[^']+'/i);

for (const file of [
  'src/views/admin/AdminLayout.vue',
  'src/views/admin/AdminOverview.vue',
  'src/views/admin/AdminUsers.vue',
  'src/views/admin/AdminBindings.vue',
  'src/views/admin/AdminRounds.vue',
  'src/views/admin/AdminDevices.vue',
  'src/views/admin/AdminCare.vue',
  'src/views/admin/AdminAnalytics.vue',
  'src/components/admin/AdminDrawer.vue',
  'src/components/admin/AdminPager.vue',
  'src/components/DesktopNav.vue'
]) {
  compile(file);
  assert.doesNotMatch(read(file), /from ['"][^'"]*supabase/, `${file} does not call Supabase directly`);
  assert.doesNotMatch(read(file), /TODO|占位/, `${file} has no placeholder copy`);
}

const service = read('src/services/admin.service.js');
assert.match(service, /admin_set_role/);
assert.match(service, /admin_create_account/);
assert.match(service, /is_super_admin/);
assert.match(service, /listAnalyticsEvents/);
assert.match(service, /loadAnalyticsSummary/);
assert.match(service, /from\('analytics_events'\)/);
assert.match(service, /from\('welcome_inquiries'\)\.select\('id, kind, email, name, message, created_at'/);
assert.match(service, /email\.ilike\.%\$\{term\}%,name\.ilike\.%\$\{term\}%,message\.ilike\.%\$\{term\}%/);
const care = read('src/views/admin/AdminCare.vue');
assert.match(care, /listWelcomeInquiries\(\{ query: query\.value, page: page\.value \}\)/);
assert.match(care, />网站留言</);
assert.match(care, /留资/);
assert.match(care, /留言/);
assert.match(care, /还没有网站留言/);
assert.doesNotMatch(read('src/views/WelcomeView.vue'), /listWelcomeInquiries|from\(['"]welcome_inquiries['"]\)/);
assert.doesNotMatch(read('src/views/admin/AdminAnalytics.vue'), /password|token|invite_code/);
assert.doesNotMatch(service, /api_key_hash/);
assert.match(read('src/services/auth.service.js'), /is_super_admin/);

console.log('ok - admin access, routes, and console screens');

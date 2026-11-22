#!/usr/bin/env node
/**
 * Tự động nâng phiên bản SCHOOL UNIVERSE đồng bộ 3 nơi:
 *   1. package.json
 *   2. public/version.json (kèm thêm vào lịch sử history)
 *   3. public/index.html (APP_VERSION, APP_RELEASE_NAME & các nhãn hiển thị)
 *
 * Cách dùng:
 *   npm run release -- 1.2.0 "Tên bản cập nhật" "Điểm mới 1" "Điểm mới 2"
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const newVersion = (args[0] || '').replace(/^v/i, '').trim();
const releaseTitle = (args[1] || '').trim();
const notes = args.slice(2).map(s => s.trim()).filter(Boolean);

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion) || !releaseTitle) {
    console.error('Cách dùng: npm run release -- <x.y.z> "<Tên bản cập nhật>" ["Ghi chú 1" "Ghi chú 2" ...]');
    console.error('Ví dụ:     npm run release -- 1.2.0 "Nâng cấp Ma Sói & Emoji" "Thêm sticker chat" "Sửa lỗi lag mobile"');
    process.exit(1);
}

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const verPath = path.join(root, 'public', 'version.json');
const htmlPath = path.join(root, 'public', 'index.html');

const today = new Date().toISOString().slice(0, 10);
const fullReleaseName = `v${newVersion} — ${releaseTitle}`;
const highlights = notes.length > 0 ? notes : [`Cập nhật ${releaseTitle}`];

// 1. package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 2. public/version.json
const verData = fs.existsSync(verPath) ? JSON.parse(fs.readFileSync(verPath, 'utf8')) : { history: [] };
const prevHistory = Array.isArray(verData.history) ? verData.history.filter(h => h.version !== newVersion) : [];
const nextVerData = {
    version: newVersion,
    releaseName: fullReleaseName,
    releasedAt: today,
    message: verData.message || 'Bạn ơi Trường vừa đẩy bản cập nhật lên, bạn cập nhật luôn cho nóng hổi nhé! 🔥',
    highlights,
    history: [
        {
            version: newVersion,
            name: releaseTitle,
            date: today,
            notes: highlights
        },
        ...prevHistory
    ]
};
fs.writeFileSync(verPath, JSON.stringify(nextVerData, null, 2) + '\n', 'utf8');

// 3. public/index.html
let html = fs.readFileSync(htmlPath, 'utf8');
const safeJsStr = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
html = html.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${safeJsStr(newVersion)}';`);
html = html.replace(/const APP_RELEASE_NAME = '[^']+';/, `const APP_RELEASE_NAME = '${safeJsStr(fullReleaseName)}';`);
html = html.replace(/(id="update-modal-title"[^>]*>)[^<]+(<\/h3>)/, `$1${fullReleaseName}$2`);
html = html.replace(/(id="entrance-version-label">)[^<]+(<\/span>)/, `$1🚀 Phiên bản v${newVersion} — Kiểm tra & Cập nhật$2`);
html = html.replace(/(id="mobile-version-tag">)[^<]+(<\/span>)/, `$1v${newVersion}$2`);
html = html.replace(/(id="desktop-version-tag">)[^<]+(<\/span>)/, `$1Cập nhật (v${newVersion})$2`);
fs.writeFileSync(htmlPath, html, 'utf8');

console.log(`✅ Đã nâng cấp đồng bộ lên ${fullReleaseName} (${today})`);
console.log('   - package.json');
console.log('   - public/version.json');
console.log('   - public/index.html');

// deploy-commands.js - Quản lý và đăng ký Slash Commands (Bao gồm /check & /nhanquest)
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.js');
let config = {};

try {
    if (fs.existsSync(configPath)) {
        config = require('./config');
    }
} catch (e) {
    console.error('❌ Không thể đọc file config.js:', e.message);
}

const token = config.BOT_TOKEN;
if (!token || typeof token !== 'string') {
    console.error('❌ Lỗi: Thiếu hoặc sai định dạng BOT_TOKEN trong tệp config.js!');
    process.exit(1);
}

function saveUserTokenToConfig(userId, userToken) {
    try {
        if (!config.USER_TOKENS) {
            config.USER_TOKENS = {};
        }
        config.USER_TOKENS[userId] = userToken;
        
        const configCode = `// config.js\nmodule.exports = ${JSON.stringify(config, null, 4)};\n`;
        fs.writeFileSync(configPath, configCode, 'utf-8');
        console.log(`💾 Đã tự động lưu Token cho User ID: ${userId} vào config.js`);
    } catch (e) {
        console.error('❌ Lỗi khi lưu Token vào file:', e.message);
    }
}

module.exports = { saveUserTokenToConfig };

// Danh sách Slash Commands đầy đủ
const commands = [
    new SlashCommandBuilder()
        .setName('intro')
        .setDescription('Giới thiệu bot, thông tin nhà phát triển dev.mrs và trung tâm xác thực'),
    new SlashCommandBuilder()
        .setName('autonhiemvu')
        .setDescription('Mở menu xác thực tài khoản cày Quest'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Hướng dẫn chi tiết cách lấy Discord User Token'),
    new SlashCommandBuilder()
        .setName('login')
        .setDescription('Mở biểu mẫu nhập User Token an toàn'),
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Kiểm tra xem quest nào đã nhận (enrolled) và quest nào chưa nhận'),
    new SlashCommandBuilder()
        .setName('nhanquest')
        .setDescription('Tự động quét và nhận toàn bộ các Quest khả dụng'),
    new SlashCommandBuilder()
        .setName('scanquest')
        .setDescription('Quét chạy danh sách Quest và khởi tạo giao diện Dashboard quản lý'),
    new SlashCommandBuilder()
        .setName('start')
        .setDescription('Bắt đầu tự động quét và làm nhiệm vụ Discord Quest'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Xem trạng thái tiến độ Quest hiện tại')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('🔄 Đang cập nhật danh sách Slash Commands...');
        const clientId = Buffer.from(token.split('.')[0], 'base64').toString('utf-8');
        
        if (config.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, config.GUILD_ID),
                { body: commands }
            );
            console.log(`✅ Đã cập nhật thành công các lệnh Slash cho Server ID: ${config.GUILD_ID}`);
        } else {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
            console.log('✅ Đã cập nhật thành công các lệnh Slash Toàn cầu!');
        }
    } catch (error) {
        console.error('❌ Lỗi khi đăng ký Slash Commands:', error);
    }
})();
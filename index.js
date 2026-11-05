// --- ĐOẠN CODE BỔ SUNG ĐỂ CHẠY TRÊN RENDER ---
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('⚡ Auto Quest Bot is running smoothly on Render!');
});

app.listen(PORT, () => {
  console.log(`[System] Web Server mồi đang hoạt động tại cổng ${PORT}`);
});
// ---------------------------------------------

// index.js - Discord Bot Controller (Full Integrated & 100% Working)
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionType,
    AttachmentBuilder
} = require('discord.js');
const axios = require('axios');
const QRCode = require('qrcode');
const WebSocket = require('ws');
const crypto = require('crypto');
const config = require('./config');
const { startRunner } = require('./runner');
const { saveUserTokenToConfig } = require('./deploy-commands');

const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const qrSessions = new Map();
const userStates = new Map();   
const userTokens = new Map();   

// Nạp sẵn các token đã lưu từ trước trong config.js vào bộ nhớ
if (config.USER_TOKENS) {
    for (const [uid, tokenVal] of Object.entries(config.USER_TOKENS)) {
        userTokens.set(uid, tokenVal);
    }
}

function getUserState(userId) {
    if (!userStates.has(userId)) {
        userStates.set(userId, {
            isRunning: false,
            username: 'N/A',
            avatarUrl: null,
            startTime: Date.now(),
            quests: [],
            logs: [],
            totalOrbs: 0
        });
    }
    return userStates.get(userId);
}

function createUserApi(userId) {
    const token = userTokens.get(userId) || config.USER_DISCORD_TOKEN;
    if (!token) return null;
    return axios.create({
        baseURL: 'https://discord.com/api/v10',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Discord/1.0.9168 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
            'X-Discord-Locale': 'vi'
        }
    });
}

function makeProgressBar(percent, length = 10) {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '🟩'.repeat(filled) + '⬛'.repeat(empty);
}

function calculateEstimatedTime(quests) {
    let remainingSeconds = 0;
    for (const q of quests) {
        if (!q.isCompleted) {
            remainingSeconds += Math.max(0, q.target - q.current);
        }
    }
    if (remainingSeconds === 0) return "Hoàn tất!";
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${mins}m ${secs < 10 ? '0' + secs : secs}s`;
}

function buildDashboardEmbed(state) {
    const totalQuests = state.quests.length || 0;
    const completedCount = state.quests.filter(q => q.isCompleted).length;
    const overallPercent = totalQuests > 0 ? Math.min(100, Math.round((completedCount / totalQuests) * 100)) : 0;

    const elapsedSecs = Math.floor((Date.now() - state.startTime) / 1000);
    const mins = Math.floor(elapsedSecs / 60);
    const secs = elapsedSecs % 60;
    const timeStr = `${mins}m ${secs < 10 ? '0' + secs : secs}s`;
    const etaStr = state.isRunning ? calculateEstimatedTime(state.quests) : "Đã tạm dừng";

    const statusTitle = state.isRunning 
        ? `⚡ BẢNG ĐIỀU KHIỂN AUTO QUEST` 
        : `⏸️ BẢNG ĐIỀU KHIỂN - TẠM DỪNG`;

    let questListStr = "";
    if (state.quests.length === 0) {
        questListStr = "```yaml\nChưa quét thấy nhiệm vụ nào khả dụng.\n```";
    } else {
        questListStr = state.quests.map(q => {
            const statusIcon = q.isCompleted ? "✅" : (q.percent > 0 ? "⏳" : "📌");
            const bar = makeProgressBar(q.percent, 8);
            return `${statusIcon} **${q.name}** (${q.taskName})\n┗ \`${bar}\` **${q.percent}%** \`(${q.current}s / ${q.target}s)\``;
        }).join('\n\n');
    }

    const logsStr = state.logs.length > 0 
        ? state.logs.slice(-5).join('\n') 
        : "Hệ thống đã sẵn sàng...";

    const embed = new EmbedBuilder()
        .setColor(state.isRunning ? '#57F287' : '#ED4245')
        .setTitle(statusTitle)
        .setDescription(
            `👤 **Tài khoản:** \`@${state.username || 'N/A'}\`\n` +
            `🎯 **Tiến độ tổng:** \`${completedCount}/${totalQuests}\` (\`${overallPercent}%\`)\n` +
            `⏱️ **Đã chạy:** \`${timeStr}\` | 🏁 **Dự kiến:** \`${etaStr}\`\n` +
            `💎 **Orbs tích lũy:** \`+${state.totalOrbs || 0}\` Orbs\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .addFields(
            { name: '📋 Danh sách Nhiệm vụ', value: questListStr, inline: false },
            { name: '⚡ Nhật ký Hoạt động', value: `\`\`\`prolog\n${logsStr}\n\`\`\``, inline: false }
        )
        .setFooter({ text: 'Discord Automation Engine • Auto Quest Pro • ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) })
        .setTimestamp();

    if (state.avatarUrl) {
        embed.setThumbnail(state.avatarUrl);
    }

    return embed;
}

function buildDashboardButtons(isRunning) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_start_action')
            .setLabel('Khởi chạy Quest')
            .setEmoji('🚀')
            .setStyle(ButtonStyle.Success)
            .setDisabled(isRunning),
        new ButtonBuilder()
            .setCustomId('btn_stop')
            .setLabel('Dừng tiến trình')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!isRunning),
        new ButtonBuilder()
            .setCustomId('btn_refresh')
            .setLabel('Làm mới')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary)
    );
}

async function sendIntroMenu(interaction) {
    const userAvatar = interaction.user.displayAvatarURL({ dynamic: true });
    const userName = interaction.user.username;
    const botAvatar = bot.user.displayAvatarURL({ dynamic: true });
    const botName = bot.user.username;

    const introEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: `Thực thi bởi: ${userName}`, iconURL: userAvatar })
        .setThumbnail(botAvatar)
        .setTitle(`🛡️ HỆ THỐNG ${botName.toUpperCase()} - TRUNG TÂM XÁC THỰC`)
        .setDescription(
            `Chào mừng bạn đến với hệ thống tự động hóa **Discord Quest Automation**!\n\n` +
            `👤 **Thông tin nhà phát triển:**\n` +
            `• Tác giả: **dev.mrs** (Hoạt động độc lập, không thuộc team/tổ chức nào).\n` +
            `• Discord ID: \`1223617384049279057\`\n\n` +
            `Vui lòng chọn phương thức kết nối tài khoản bên dưới để bắt đầu cày Quest tự động:`
        )
        .addFields(
            { name: '🔑 Nhập Token', value: 'Nhập trực tiếp User Token của bạn để bắt đầu.', inline: false },
            { name: '📱 Quét mã QR', value: 'Xác thực an toàn qua ứng dụng Discord Mobile.', inline: false },
            { name: '📖 Hướng dẫn', value: 'Xem cú pháp lấy User Token chuẩn xác nhất.', inline: false }
        )
        .setFooter({ text: 'Hệ thống tự động hóa an toàn • Auto Quest Engine' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_login_token').setLabel('Nhập User Token').setEmoji('🔑').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_login_qr').setLabel('Quét Mã QR').setEmoji('📱').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_token_guide').setLabel('Hướng dẫn').setEmoji('📖').setStyle(ButtonStyle.Secondary)
    );

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [introEmbed], components: [row], files: [] });
    } else {
        await interaction.reply({ embeds: [introEmbed], components: [row], flags: 64 });
    }
}

async function sendTokenGuide(interaction) {
    const userAvatar = interaction.user.displayAvatarURL({ dynamic: true });
    const userName = interaction.user.username;

    const guideEmbed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setAuthor({ name: `Yêu cầu từ: ${userName}`, iconURL: userAvatar })
        .setTitle('📖 HƯỚNG DẪN LẤY DISCORD USER TOKEN')
        .setDescription(
            'Thực hiện theo các bước chi tiết bên dưới:\n\n' +
            '**Bước 1:** Mở Discord trên trình duyệt Web (Chrome, Edge...).\n' +
            '**Bước 2:** Nhấn phím **`F12`** để mở bảng Console (Nhà phát triển).\n' +
            '**Bước 3:** Dán đoạn mã script chính xác sau vào Console và bấm `Enter`:\n' +
            '```javascript\n' +
            '(() => {\n' +
            '  let token = "";\n' +
            '  try {\n' +
            '    const modules = Object.values(\n' +
            '      webpackChunkdiscord_app.push([[Symbol()], {}, (require) => require.c])\n' +
            '    );\n' +
            '    for (const module of modules) {\n' +
            '      try {\n' +
            '        if (!module.exports || module.exports === window) continue;\n' +
            '        if (module.exports?.getToken) {\n' +
            '          token = module.exports.getToken();\n' +
            '          break;\n' +
            '        }\n' +
            '        for (const key in module.exports) {\n' +
            '          const value = module.exports[key];\n' +
            '          if (value?.getToken && value[Symbol.toStringTag] !== "IntlMessagesProxy") {\n' +
            '            token = value.getToken();\n' +
            '            break;\n' +
            '          }\n' +
            '        }\n' +
            '      } catch {}\n' +
            '      if (token) break;\n' +
            '    }\n' +
            '  } catch {}\n' +
            '  if (token) {\n' +
            '    window.prompt("🎉 Lấy Token thành công! Hãy copy đoạn mã dưới đây:", token);\n' +
            '  } else {\n' +
            '    alert("❌ Không thể lấy được Token! Hãy chắc chắn bạn đang ở trang Discord Web và đã đăng nhập.");\n' +
            '  }\n' +
            '})();\n' +
            '```\n' +
            '**Bước 4:** Copy chuỗi Token hiện ra trên màn hình, sau đó bấm nút bên dưới để dán vào Bot!'
        )
        .setFooter({ text: 'Lưu ý: Tuyệt đối không chia sẻ Token cho người khác!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_login_token').setLabel('Nhập Token Ngay').setEmoji('🔑').setStyle(ButtonStyle.Primary)
    );

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [guideEmbed], components: [row], flags: 64 });
    } else {
        await interaction.reply({ embeds: [guideEmbed], components: [row], flags: 64 });
    }
}

async function startQrSession(interaction) {
    const userId = interaction.user.id;
    if (qrSessions.has(userId)) stopQrSession(userId, null, null);

    await interaction.deferReply({ flags: 64 });
    const loadingEmbed = new EmbedBuilder().setColor('#5865F2').setDescription('⏳ Đang kết nối cổng WebSocket Remote Auth...');
    await interaction.editReply({ embeds: [loadingEmbed], files: [], components: [] });

    try {
        const ws = new WebSocket('wss://remote-auth-gateway.discord.gg/?v=2', {
            headers: { 'Origin': 'https://discord.com', 'User-Agent': 'Mozilla/5.0' }
        });

        let session = {
            ws,
            interval: null,
            timeout: setTimeout(() => stopQrSession(userId, interaction, "⏱ Mã QR đã hết hạn!"), 180000)
        };
        qrSessions.set(userId, session);

        ws.on('message', async (data) => {
            try {
                const payload = JSON.parse(data);
                const state = getUserState(userId);

                if (payload.op === 'hello') {
                    session.interval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'heartbeat' }));
                    }, payload.heartbeat_interval);
                } else if (payload.op === 'nonce_proof') {
                    const hash = crypto.createHash('sha256').update(payload.nonce).digest();
                    ws.send(JSON.stringify({ op: 'nonce_proof', proof: hash.toString('base64url') }));
                } else if (payload.op === 'pending_remote_init') {
                    const qrBuffer = await QRCode.toBuffer(`https://discordapp.com/ra/${payload.fingerprint}`, { margin: 2, scale: 6 });
                    const attachment = new AttachmentBuilder(qrBuffer, { name: 'qr.png' });
                    const qrEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('📱 Quét mã QR xác thực')
                        .setImage('attachment://qr.png');
                    await interaction.editReply({ embeds: [qrEmbed], files: [attachment] });
                } else if (payload.op === 'finish') {
                    userTokens.set(userId, payload.token);
                    saveUserTokenToConfig(userId, payload.token);
                    stopQrSession(userId, null, null);

                    const userRes = await createUserApi(userId).get('/users/@me');
                    state.username = userRes.data.username || userRes.data.global_name || 'N/A';
                    state.avatarUrl = userRes.data.avatar ? `https://cdn.discordapp.com/avatars/${userRes.data.id}/${userRes.data.avatar}.png` : null;

                    const successEmbed = new EmbedBuilder()
                        .setColor('#57F287')
                        .setTitle('✨ KẾT NỐI MÃ QR THÀNH CÔNG')
                        .setDescription(`Đã liên kết tài khoản: **@${state.username}**`)
                        .setThumbnail(state.avatarUrl);

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_start_action').setLabel('Khởi chạy Dashboard').setStyle(ButtonStyle.Primary).setEmoji('🚀')
                    );
                    await interaction.editReply({ embeds: [successEmbed], files: [], components: [row] });
                }
            } catch (e) {}
        });
        ws.on('error', () => interaction.editReply({ content: '❌ Lỗi kết nối cổng QR.', embeds: [] }));
    } catch (e) {
        await interaction.editReply({ content: `❌ Lỗi khởi tạo: ${e.message}` });
    }
}

function stopQrSession(userId, interaction, msg) {
    if (qrSessions.has(userId)) {
        const s = qrSessions.get(userId);
        if (s.interval) clearInterval(s.interval);
        if (s.timeout) clearTimeout(s.timeout);
        if (s.ws.readyState === 1) s.ws.close();
        qrSessions.delete(userId);
    }
    if (interaction && msg) interaction.editReply({ content: msg, embeds: [], files: [], components: [] }).catch(() => {});
}

bot.on('interactionCreate', async (interaction) => {
    const userId = interaction.user.id;
    const state = getUserState(userId);
    const userAvatar = interaction.user.displayAvatarURL({ dynamic: true });
    const userName = interaction.user.username;

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'intro' || interaction.commandName === 'autonhiemvu') {
            await sendIntroMenu(interaction);
        } else if (interaction.commandName === 'help') {
            await sendTokenGuide(interaction);
        } else if (interaction.commandName === 'login') {
            const loginEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setAuthor({ name: `Yêu cầu từ: ${userName}`, iconURL: userAvatar })
                .setThumbnail(userAvatar)
                .setTitle('🔑 ĐĂNG NHẬP BẰNG USER TOKEN')
                .setDescription('Vui lòng bấm vào nút bên dưới để mở giao diện nhập Token.');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_login_token').setLabel('Nhập Token Ngay').setEmoji('🔑').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [loginEmbed], components: [row], flags: 64 });
        } 
        
        // LỆNH /CHECK
        else if (interaction.commandName === 'check') {
            const api = createUserApi(userId);
            if (!api) return await sendIntroMenu(interaction);

            await interaction.deferReply({ flags: 64 });
            try {
                const userRes = await api.get('/users/@me');
                const pUsername = userRes.data.username || userRes.data.global_name || 'N/A';
                const pAvatar = userRes.data.avatar ? `https://cdn.discordapp.com/avatars/${userRes.data.id}/${userRes.data.avatar}.png` : null;

                const res = await api.get('/quests/@me');
                const allQuests = res.data.quests || res.data || [];
                
                let enrolledList = [];
                let notEnrolledList = [];
                let completedList = [];

                for (let x of allQuests) {
                    const configData = x.config;
                    if (!configData) continue;
                    const qName = configData.messages?.quest_name || configData.messages?.questName || x.id;
                    const isCompleted = x.user_status?.completed_at != null;
                    const isEnrolled = x.user_status?.enrolled_at != null;

                    if (isCompleted) {
                        completedList.push(`✅ **${qName}** (Đã hoàn thành)`);
                    } else if (isEnrolled) {
                        enrolledList.push(`📥 **${qName}** (Đã nhận / Enrolled)`);
                    } else {
                        notEnrolledList.push(`📌 **${qName}** (Chưa nhận)`);
                    }
                }

                const checkEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setAuthor({ name: `Kiểm tra bởi: ${userName}`, iconURL: userAvatar })
                    .setThumbnail(userAvatar)
                    .setTitle(`📊 TRẠNG THÁI NHIỆM VỤ - @${pUsername}`)
                    .setDescription('Tổng quan trạng thái các Quest hiện có trên tài khoản của bạn:')
                    .addFields(
                        { name: `📥 Đã nhận / Đang làm (${enrolledList.length})`, value: enrolledList.length > 0 ? enrolledList.join('\n') : '_Không có_', inline: false },
                        { name: `📌 Chưa nhận (${notEnrolledList.length})`, value: notEnrolledList.length > 0 ? notEnrolledList.join('\n') : '_Không có_', inline: false },
                        { name: `✅ Đã hoàn tất (${completedList.length})`, value: completedList.length > 0 ? completedList.join('\n') : '_Không có_', inline: false }
                    )
                    .setFooter({ text: 'Dùng lệnh /nhanquest để tự động nhận tất cả các quest chưa nhận!' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [checkEmbed] });
            } catch (e) {
                await interaction.editReply({ content: `❌ Lỗi khi kiểm tra quest: ${e.response?.data?.message || e.message}` });
            }
        }

        // LỆNH /NHANQUEST
        else if (interaction.commandName === 'nhanquest') {
            const api = createUserApi(userId);
            if (!api) return await sendIntroMenu(interaction);

            await interaction.deferReply({ flags: 64 });
            try {
                const userRes = await api.get('/users/@me');
                state.username = userRes.data.username || userRes.data.global_name || 'N/A';
                state.avatarUrl = userRes.data.avatar ? `https://cdn.discordapp.com/avatars/${userRes.data.id}/${userRes.data.avatar}.png` : null;

                const res = await api.get('/quests/@me');
                const allQuests = res.data.quests || res.data || [];
                const now = Date.now();

                let enrolledCount = 0;
                state.quests = [];

                for (let x of allQuests) {
                    const configData = x.config;
                    if (!configData) continue;
                    const isCompleted = x.user_status?.completed_at != null;
                    const isEnrolled = x.user_status?.enrolled_at != null;
                    const notExpired = new Date(configData.expires_at || configData.expiresAt).getTime() > now;

                    if (!isCompleted && notExpired) {
                        if (!isEnrolled) {
                            try {
                                await api.post(`/quests/${x.id}/enroll`, {});
                                enrolledCount++;
                            } catch (err) {}
                        }

                        const qName = configData.messages?.quest_name || configData.messages?.questName || x.id;
                        const taskConfig = configData.task_config ?? configData.task_config_v2 ?? configData.taskConfig ?? configData.taskConfigV2;
                        const tasksMap = taskConfig?.tasks || {};
                        
                        let taskName = Object.keys(tasksMap)[0] || "PLAY_ON_DESKTOP";
                        if (taskConfig?.video_id || configData?.video_id) {
                            taskName = "WATCH_VIDEO";
                        }

                        const taskData = tasksMap[taskName] || {};
                        const targetProgress = taskData.target || taskConfig?.duration || 900;
                        const currentProgress = x.user_status?.progress?.[taskName]?.value ?? x.user_status?.progress?.video_progress?.value ?? 0;
                        
                        state.quests.push({
                            id: x.id,
                            name: qName,
                            taskName: taskName,
                            target: targetProgress,
                            current: Math.floor(currentProgress),
                            percent: Math.min(100, Math.round((currentProgress / targetProgress) * 100)),
                            reward: 200,
                            isCompleted: false
                        });
                    }
                }

                state.logs.push(`[${new Date().toLocaleTimeString('vi-VN', { hour12: false })}] 📥 [NhanQuest] Đã tự động nhận ${enrolledCount} quest mới và quét tổng cộng ${state.quests.length} nhiệm vụ.`);
                
                const embed = buildDashboardEmbed(state);
                embed.setAuthor({ name: `Thao tác bởi: ${userName}`, iconURL: userAvatar });
                embed.setThumbnail(userAvatar);
                await interaction.editReply({ embeds: [embed], components: [buildDashboardButtons(false)] });
            } catch (e) {
                await interaction.editReply({ content: `❌ Lỗi khi tự động nhận quest: ${e.response?.data?.message || e.message}` });
            }
        } 
        
        else if (interaction.commandName === 'scanquest') {
            const api = createUserApi(userId);
            if (!api) return await sendIntroMenu(interaction);

            await interaction.deferReply({ flags: 64 });
            try {
                const userRes = await api.get('/users/@me');
                state.username = userRes.data.username || userRes.data.global_name || 'N/A';
                state.avatarUrl = userRes.data.avatar ? `https://cdn.discordapp.com/avatars/${userRes.data.id}/${userRes.data.avatar}.png` : null;

                const res = await api.get('/quests/@me');
                const allQuests = res.data.quests || res.data || [];
                const now = Date.now();

                state.quests = [];
                for (let x of allQuests) {
                    const configData = x.config;
                    if (!configData) continue;
                    const isCompleted = x.user_status?.completed_at != null;
                    const notExpired = new Date(configData.expires_at || configData.expiresAt).getTime() > now;

                    if (!isCompleted && notExpired) {
                        const qName = configData.messages?.quest_name || configData.messages?.questName || x.id;
                        const taskConfig = configData.task_config ?? configData.task_config_v2 ?? configData.taskConfig ?? configData.taskConfigV2;
                        const tasksMap = taskConfig?.tasks || {};
                        
                        let taskName = Object.keys(tasksMap)[0] || "PLAY_ON_DESKTOP";
                        if (taskConfig?.video_id || configData?.video_id) {
                            taskName = "WATCH_VIDEO";
                        }

                        const taskData = tasksMap[taskName] || {};
                        const targetProgress = taskData.target || taskConfig?.duration || 900;
                        const currentProgress = x.user_status?.progress?.[taskName]?.value ?? x.user_status?.progress?.video_progress?.value ?? 0;
                        
                        state.quests.push({
                            id: x.id,
                            name: qName,
                            taskName: taskName,
                            target: targetProgress,
                            current: Math.floor(currentProgress),
                            percent: Math.min(100, Math.round((currentProgress / targetProgress) * 100)),
                            reward: 200,
                            isCompleted: false
                        });
                    }
                }

                state.logs.push(`[${new Date().toLocaleTimeString('vi-VN', { hour12: false })}] 🔍 [ScanQuest] Đã quét thành công ${state.quests.length} nhiệm vụ.`);
                
                const embed = buildDashboardEmbed(state);
                embed.setAuthor({ name: `Thao tác bởi: ${userName}`, iconURL: userAvatar });
                embed.setThumbnail(userAvatar);
                await interaction.editReply({ embeds: [embed], components: [buildDashboardButtons(false)] });
            } catch (e) {
                await interaction.editReply({ content: `❌ Lỗi khi scan quest: ${e.response?.data?.message || e.message}` });
            }
        } else if (interaction.commandName === 'start' || interaction.commandName === 'status') {
            const api = createUserApi(userId);
            if (!api) return await sendIntroMenu(interaction);
            
            if (interaction.commandName === 'status') {
                await interaction.deferReply({ flags: 64 });
                const embed = buildDashboardEmbed(state);
                embed.setAuthor({ name: `Trạng thái của: ${userName}`, iconURL: userAvatar });
                embed.setThumbnail(userAvatar);
                return await interaction.editReply({ embeds: [embed] });
            }
            
            await interaction.deferReply();
            if (state.isRunning) return await interaction.editReply({ content: "⚠️ Tiến trình đang chạy!" });
            
            const embed = buildDashboardEmbed(state);
            embed.setAuthor({ name: `Tiến trình của: ${userName}`, iconURL: userAvatar });
            embed.setThumbnail(userAvatar);
            
            const msg = await interaction.editReply({ embeds: [embed], components: [buildDashboardButtons(true)] });
            startRunner(api, msg, buildDashboardEmbed, buildDashboardButtons, state, interaction.user);
        }
    } else if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'modal_login') {
        await interaction.deferReply({ flags: 64 });
        const inputToken = interaction.fields.getTextInputValue('token_input').trim();
        userTokens.set(userId, inputToken);
        saveUserTokenToConfig(userId, inputToken);

        try {
            const userRes = await createUserApi(userId).get('/users/@me');
            state.username = userRes.data.username || userRes.data.global_name || 'N/A';
            state.avatarUrl = userRes.data.avatar ? `https://cdn.discordapp.com/avatars/${userRes.data.id}/${userRes.data.avatar}.png` : null;
            
            const successEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setAuthor({ name: `Xác thực bởi: ${userName}`, iconURL: userAvatar })
                .setThumbnail(userAvatar)
                .setTitle('✨ XÁC THỰC TOKEN THÀNH CÔNG')
                .setDescription(`Xin chào **@${state.username}**!\nToken đã hợp lệ. Hãy dùng lệnh \`/check\` hoặc \`/nhanquest\` để quản lý nhiệm vụ.`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_start_action').setLabel('Khởi động ngay').setEmoji('🚀').setStyle(ButtonStyle.Primary)
            );
            await interaction.editReply({ embeds: [successEmbed], components: [row] });
        } catch (e) {
            userTokens.delete(userId);
            await interaction.editReply({ content: '❌ Token không hợp lệ hoặc đã hết hạn.' });
        }
    } else if (interaction.isButton()) {
        const api = createUserApi(userId);

        if (interaction.customId === 'btn_login_token') {
            const modal = new ModalBuilder().setCustomId('modal_login').setTitle('Xác thực User Token');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('token_input').setLabel('Dán chuỗi Discord Token').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            await interaction.showModal(modal);
        } else if (interaction.customId === 'btn_login_qr') {
            await startQrSession(interaction);
        } else if (interaction.customId === 'btn_token_guide') {
            await sendTokenGuide(interaction);
        } else if (interaction.customId === 'btn_start_quest' || interaction.customId === 'btn_start_action') {
            if (!api) return await sendIntroMenu(interaction);
            
            await interaction.deferReply().catch(() => {});

            if (state.isRunning) {
                return await interaction.editReply({ content: "⚠️ Tiến trình đang chạy rồi!" }).catch(() => {});
            }

            const embed = buildDashboardEmbed(state);
            embed.setAuthor({ name: `Tiến trình của: ${userName}`, iconURL: userAvatar });
            embed.setThumbnail(userAvatar);

            const msg = await interaction.editReply({ 
                embeds: [embed], 
                components: [buildDashboardButtons(true)] 
            }).catch(() => {});

            if (msg) {
                startRunner(api, msg, buildDashboardEmbed, buildDashboardButtons, state, interaction.user);
            }
        } else if (interaction.customId === 'btn_stop') {
            state.isRunning = false;
            state.logs.push(`[${new Date().toLocaleTimeString('vi-VN', { hour12: false })}] ⏹️ Tiến trình đã dừng.`);
            
            const embed = buildDashboardEmbed(state);
            embed.setAuthor({ name: `Thao tác bởi: ${userName}`, iconURL: userAvatar });
            embed.setThumbnail(userAvatar);
            await interaction.update({ embeds: [embed], components: [buildDashboardButtons(false)] });
        } else if (interaction.customId === 'btn_refresh') {
            if (!api) return await sendIntroMenu(interaction);
            try {
                const res = await api.get('/quests/@me');
                const allQuests = res.data.quests || res.data || [];
                const now = Date.now();
                state.quests = [];
                for (let x of allQuests) {
                    const configData = x.config;
                    if (!configData) continue;
                    const isCompleted = x.user_status?.completed_at != null;
                    const notExpired = new Date(configData.expires_at || configData.expiresAt).getTime() > now;
                    
                    if (!isCompleted && notExpired) {
                        const qName = configData.messages?.quest_name || configData.messages?.questName || x.id;
                        const taskConfig = configData.task_config ?? configData.task_config_v2 ?? configData.taskConfig ?? configData.taskConfigV2;
                        const tasksMap = taskConfig?.tasks || {};
                        
                        let taskName = Object.keys(tasksMap)[0] || "PLAY_ON_DESKTOP";
                        if (taskConfig?.video_id || configData?.video_id) {
                            taskName = "WATCH_VIDEO";
                        }

                        const taskData = tasksMap[taskName] || {};
                        const targetProgress = taskData.target || taskConfig?.duration || 900;
                        const currentProgress = x.user_status?.progress?.[taskName]?.value ?? x.user_status?.progress?.video_progress?.value ?? 0;
                        
                        state.quests.push({
                            id: x.id,
                            name: qName,
                            taskName: taskName,
                            target: targetProgress,
                            current: Math.floor(currentProgress),
                            percent: Math.min(100, Math.round((currentProgress / targetProgress) * 100)),
                            reward: 200,
                            isCompleted: false
                        });
                    }
                }
            } catch(err) {}

            const embed = buildDashboardEmbed(state);
            embed.setAuthor({ name: `Làm mới bởi: ${userName}`, iconURL: userAvatar });
            embed.setThumbnail(userAvatar);
            await interaction.update({ embeds: [embed], components: [buildDashboardButtons(state.isRunning)] });
        }
    }
});

bot.once('ready', () => console.log(`Bot online: ${bot.user.tag}`));
bot.login(config.BOT_TOKEN);
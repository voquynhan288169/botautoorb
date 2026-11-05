// runner.js - Fixed Video Quest & Task Engine (100% Match Console Logic)
const supportedTasks = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];

function getTime() {
    return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

async function startRunner(userApi, dashboardMessage, buildEmbed, buildButtons, userState, interactionUser) {
    userState.isRunning = true;
    userState.startTime = Date.now();
    userState.quests = [];
    userState.logs = [];
    userState.totalOrbs = 0;

    userState.logs.push(`[${getTime()}] ℹ️ [System] Đang quét danh sách Quest từ Discord API...`);
    await dashboardMessage.edit({ embeds: [buildEmbed(userState)], components: [buildButtons(true)] }).catch(() => {});

    try {
        const response = await userApi.get('/quests/@me');
        const rawQuests = response.data.quests || response.data || [];
        const now = Date.now();

        // Lọc danh sách Quest khả dụng
        const quests = rawQuests.map(x => ({
            id: x.id,
            config: x.config,
            userStatus: {
                enrolledAt: x.user_status?.enrolled_at ?? x.userStatus?.enrolledAt,
                completedAt: x.user_status?.completed_at ?? x.userStatus?.completedAt,
                progress: x.user_status?.progress ?? x.userStatus?.progress
            }
        })).filter(x => {
            if (!x.config || !x.userStatus) return false;
            
            const notCompleted = x.userStatus.completedAt == null;
            const notExpired = new Date(x.config.expires_at || x.config.expiresAt).getTime() > now;
            
            const taskConfig = x.config.taskConfig ?? x.config.taskConfigV2 ?? x.config.task_config ?? x.config.task_config_v2;
            const tasks = taskConfig?.tasks || {};
            const hasValidTask = supportedTasks.some(y => tasks[y] != null) || taskConfig?.video_id || x.config?.video_id;

            return notCompleted && notExpired && hasValidTask;
        });

        if (quests.length === 0) {
            userState.isRunning = false;
            userState.logs.push(`[${getTime()}] ✅ [System] Không tìm thấy nhiệm vụ nào chưa hoàn thành!`);
            await dashboardMessage.edit({ embeds: [buildEmbed(userState)], components: [buildButtons(false)] }).catch(() => {});
            return;
        }

        // Đưa vào danh sách Dashboard hiển thị
        for (const q of quests) {
            const taskConfig = q.config.taskConfig ?? q.config.taskConfigV2 ?? q.config.task_config ?? q.config.task_config_v2;
            let taskName = supportedTasks.find(x => taskConfig?.tasks?.[x] != null);
            
            // Ép nhận diện chuẩn xác nếu là Quest Video
            if (!taskName && (taskConfig?.video_id || q.config?.video_id || taskConfig?.tasks?.WATCH_VIDEO || taskConfig?.tasks?.WATCH_VIDEO_ON_MOBILE)) {
                taskName = taskConfig?.tasks?.WATCH_VIDEO_ON_MOBILE ? "WATCH_VIDEO_ON_MOBILE" : "WATCH_VIDEO";
            }

            const taskData = taskConfig?.tasks?.[taskName] || {};
            const qName = q.config.messages?.questName || q.config.messages?.quest_name || q.id;
            const target = taskData.target || 300; // Mặc định video thường khoảng 300s
            const current = q.userStatus?.progress?.[taskName]?.value || q.userStatus?.progress?.video_progress?.value || 0;

            userState.quests.push({
                id: q.id,
                name: qName,
                taskName: taskName || "WATCH_VIDEO",
                target: target,
                current: Math.floor(current),
                percent: Math.min(100, Math.round((current / target) * 100)),
                reward: 200,
                isCompleted: false,
                raw: q
            });
        }

        await dashboardMessage.edit({ embeds: [buildEmbed(userState)], components: [buildButtons(true)] }).catch(() => {});

        // Vòng lặp thực thi từng quest
        let index = 0;
        const doJob = async () => {
            if (!userState.isRunning || index >= quests.length) {
                userState.isRunning = false;
                userState.logs.push(`[${getTime()}] 🎉 [System] Toàn bộ chuỗi nhiệm vụ đã được xử lý xong!`);
                await dashboardMessage.edit({ embeds: [buildEmbed(userState)], components: [buildButtons(false)] }).catch(() => {});
                return;
            }

            const quest = quests[index++];
            const questObj = userState.quests.find(q => q.id === quest.id);
            if (!questObj) return doJob();

            const questName = quest.config.messages?.questName || quest.config.messages?.quest_name || quest.id;
            const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2 ?? quest.config.task_config ?? quest.config.task_config_v2;
            let taskName = questObj.taskName;
            const taskData = taskConfig?.tasks?.[taskName] || {};
            const secondsNeeded = taskData.target || questObj.target;
            let secondsDone = quest.userStatus?.progress?.[taskName]?.value || quest.userStatus?.progress?.video_progress?.value || 0;

            userState.logs.push(`[${getTime()}] 🎬 [QUEST] Bắt đầu chạy: ${questName} (${taskName})`);
            await dashboardMessage.edit({ embeds: [buildEmbed(userState)], components: [buildButtons(true)] }).catch(() => {});

            // ==========================================
            // XỬ LÝ CHUẨN XÁC QUEST VIDEO
            // ==========================================
            if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
                const speed = 7; // Nhịp độ 7 giây mỗi bước
                let completed = false;

                while (userState.isRunning && secondsDone < secondsNeeded) {
                    const remaining = Math.min(speed, secondsNeeded - secondsDone);
                    await new Promise(resolve => setTimeout(resolve, remaining * 1000));
                    if (!userState.isRunning) break;

                    const timestamp = secondsDone + speed;
                    const sendTimestamp = Math.min(secondsNeeded, timestamp + Math.random());

                    try {
                        const res = await userApi.post(`/quests/${quest.id}/video-progress`, {
                            timestamp: sendTimestamp
                        }).catch(err => ({ data: err.response?.data }));

                        completed = (res.data?.completed_at || res.data?.completedAt) != null;
                        secondsDone = Math.min(secondsNeeded, timestamp);
                    } catch (e) {
                        secondsDone = Math.min(secondsNeeded, timestamp);
                    }

                    questObj.current = Math.floor(secondsDone);
                    questObj.percent = Math.min(100, Math.round((secondsDone / secondsNeeded) * 100));
                    await dashboardMessage.edit({ embeds: [buildEmbed(userState)], components: [buildButtons(true)] }).catch(() => {});

                    if (secondsDone >= secondsNeeded || completed) break;
                }

                if (!completed && userState.isRunning) {
                    await userApi.post(`/quests/${quest.id}/video-progress`, {
                        timestamp: secondsNeeded
                    }).catch(() => {});
                }

                questObj.isCompleted = true;
                questObj.percent = 100;
                userState.totalOrbs += 200;
                userState.logs.push(`[${getTime()}] ✅ [SUCCESS] Hoàn thành video: ${questName}`);
                await doJob();

            // ==========================================
            // XỬ LÝ HEARTBEAT (GAMES / ACTIVITY)
            // ==========================================
            } else {
                const channelId = "0"; 
                const streamKey = `call:${channelId}:1`;

                while (userState.isRunning && secondsDone < secondsNeeded) {
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    if (!userState.isRunning) break;

                    try {
                        const res = await userApi.post(`/quests/${quest.id}/heartbeat`, {
                            stream_key: streamKey,
                            terminal: false
                        }).catch(err => ({ data: err.response?.data }));

                        const progress = res.data?.progress?.[taskName]?.value || res.data?.user_status?.progress?.[taskName]?.value;
                        if (progress !== undefined) {
                            secondsDone = progress;
                        } else {
                            secondsDone = Math.min(secondsNeeded, secondsDone + 15);
                        }
                    } catch (e) {
                        secondsDone = Math.min(secondsNeeded, secondsDone + 15);
                    }

                    questObj.current = Math.floor(secondsDone);
                    questObj.percent = Math.min(100, Math.round((secondsDone / secondsNeeded) * 100));
                    await dashboardMessage.edit({ embeds: [buildEmbed(userState)], components: [buildButtons(true)] }).catch(() => {});

                    if (secondsDone >= secondsNeeded) {
                        await userApi.post(`/quests/${quest.id}/heartbeat`, {
                            stream_key: streamKey,
                            terminal: true
                        }).catch(() => {});
                        break;
                    }
                }

                questObj.isCompleted = true;
                questObj.percent = 100;
                userState.totalOrbs += 200;
                userState.logs.push(`[${getTime()}] ✅ [SUCCESS] Hoàn thành task: ${questName}`);
                await doJob();
            }
        };

        doJob();

    } catch (err) {
        userState.isRunning = false;
        userState.logs.push(`[${getTime()}] ❌ [Error] ${err.message}`);
        await dashboardMessage.edit({ embeds: [buildEmbed(userState)], components: [buildButtons(false)] }).catch(() => {});
    }
}

module.exports = { startRunner };
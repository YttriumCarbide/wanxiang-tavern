# 游戏音频

- `tavern.mp3`：《炉边多利安》（Hearthside Dorian），酒馆背景音乐。
- `xueyuan.mp3`：《雪原》，用户提供，霜晶矿窟的小怪战音乐。
- `encounter.mp3`：《遭遇战》，用户提供，其他四种场景的小怪战音乐。
- `battle.m4a`：《界门之战》，原小怪战曲目，现用于界隙遗迹Boss战，保留2分47秒曲目。
- `boss.m4a`：《首领决战》，其他场景Boss战音乐，保留2分33秒曲目。

短音效由原创分层WAV采样提供，位于`assets/audio/sfx/`，源脚本为`tools/audio/build_sfx.py`。采样覆盖武器起手／命中、十二类敌人攻击、界面操作、门、回合、治疗、护盾、胜负和Boss死亡等48个事件；`src/audio/sfx.js`登记文件、音量与轻微随机音高，`src/audio/cues.js`保留运行时合成兜底。
选曲统一由`src/audio/config.js`的`encounterMusic`按实际场景与Boss标志决定。

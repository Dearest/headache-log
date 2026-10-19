# 头痛日记

一个给自己用的头痛记录 PWA：在可旋转的 3D 全息头像上标出痛的位置和类型，配合每天一句话的打卡，攒够数据后一键导出给 AI 找诱因。

## 功能

- **3D 标注**：拖动旋转、五个快捷视角、可开关的内置头骨。先选疼痛类型再点头部，每个点各带一种类型，动画模拟那种痛的感觉（搏动性按心跳胀缩、钝痛是一大片暗红、钻痛是漩涡……），部位名自动生成。
- **四步记录**：哪里痛·什么样的痛 → 有多痛（0–10 级，每级附通俗描述和对生活的影响）·伴随症状 → 用药·时间 → 之前做了什么。保存时按开始时间自动记录气压、温度、湿度（Open-Meteo）。
- **一句话打卡**：每天一句，不头痛的日子也记，作为和头痛日对比的基线。
- **日历与统计**：按严重程度着色的月历、3D 部位分布、类型和时段统计、止痛药使用天数提醒。
- **导出给 AI**：把一段时间的打卡和头痛记录整理成带分析要求的 Markdown。
- **本地优先 + 云端同步**：离线也能记，联网后自动同步；手机、电脑共用一份数据。

## 技术栈

React + TypeScript + Vite，three.js 渲染；Cloudflare Workers 托管静态资源并提供 API，数据存在 D1；PIN 鉴权。

## 开发

```bash
npm install
npm run models                                   # 下载并预处理 3D 模型，生成 public/models/*.bin
echo 'APP_PIN=0000' > .dev.vars
npx wrangler d1 migrations apply headache-log --local
npm run worker:dev                               # 构建并在本地跑 Worker（含 API）
```

只改前端时可以另开 `npm run dev`，`/api` 会代理到本地 Worker。

## 部署

```bash
npx wrangler d1 create headache-log              # 把输出的 database_id 填进 wrangler.jsonc
npm run db:migrate
npx wrangler secret put APP_PIN
npm run deploy
```

## 模型来源

- 头部：Lee Perry-Smith 头部扫描，[Infinite-Realities](https://www.ir-ltd.net/) 制作，CC BY 3.0（取自 three.js 示例）。预处理时封闭了眼睛和嘴部的空腔。
- 头骨：[Khronos glTF-Sample-Assets / ScatteringSkull](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ScatteringSkull)，Vladimir Petkovic / Adobe，CC0。预处理时简化到 3 万面。

> 这是个人记录工具，不提供医学诊断。出现突发剧烈头痛（霹雳样头痛）等危险信号时请立即就医。

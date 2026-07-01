# SignBridge 手语桥 - BytePlus Pages 部署指南

## 快速部署

### 方式一：Git 自动部署（推荐）

1. 登录 [BytePlus Pages 控制台](https://pages.byteplus.com/)
2. 点击"创建站点"，选择"连接 Git 仓库"
3. 授权并选择本项目仓库
4. 填写以下配置：

| 配置项 | 值 |
|--------|-----|
| 项目根目录 | `/`（仓库根目录） |
| 构建命令 | `cd frontend && npm install && npm run build` |
| 构建输出目录 | `frontend/dist` |
| Node.js 版本 | `18` 或更高 |

5. 点击"部署"，等待构建完成即可访问

### 方式二：手动上传

```bash
# 1. 本地构建
cd frontend
npm install
npm run build

# 2. 打包 dist 目录
cd dist && zip -r ../signbridge-build.zip ./*

# 3. 在 BytePlus Pages 控制台选择"上传部署"，上传 signbridge-build.zip
```

## 已配置文件说明

- [byteplus-pages.yaml](byteplus-pages.yaml) - BytePlus Pages 构建与路由配置
- [frontend/public/_redirects](frontend/public/_redirects) - SPA 路由重写（刷新页面不404）
- [frontend/vite.config.ts](frontend/vite.config.ts) - Vite 构建配置（含 PWA 插件）

## 环境变量（可选）

如需配置环境变量，在 BytePlus Pages 控制台"站点设置"→"环境变量"中添加：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| VITE_API_BASE | 后端API地址（如无后端可留空） | `https://api.example.com` |

## 自定义域名

1. 在 BytePlus Pages 控制台进入站点详情
2. 点击"域名"→"添加自定义域名"
3. 按提示配置 DNS 解析记录
4. 系统会自动申请 HTTPS 证书

## 本地预览部署产物

```bash
cd frontend
npm run build
npm run preview
# 访问 http://localhost:4173 验证生产构建
```

## PWA 说明

项目已配置 PWA（渐进式 Web 应用），部署后用户可：
- 安装到桌面/主屏幕
- 离线访问已加载过的页面
- Service Worker 自动更新

## 故障排查

### 刷新页面出现 404
- 确认 `_redirects` 文件已正确放置在 `public/` 目录
- 确认构建后 `dist/` 目录根下有 `_redirects` 文件

### 构建失败
- 检查 Node.js 版本是否 >= 18
- 确认构建命令正确：`cd frontend && npm install && npm run build`
- 本地先执行 `npm run build` 验证构建成功

### Three.js/VRM 模型加载失败
- 确认 `/models/avatar.vrm` 已包含在部署产物中
- 检查浏览器控制台是否有 CORS 错误（BytePlus Pages 默认支持静态资源）

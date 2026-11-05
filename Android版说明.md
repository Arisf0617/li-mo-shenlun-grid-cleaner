# 留墨 Android 版

安装包位于 `留墨-Android.apk` 与 `android-app/app/build/outputs/apk/debug/app-debug.apk`。

- Android 原生 WebView 加载应用内打包的本地页面，不依赖网络服务。
- 系统文件选择器读取相册照片；不申请读取整个相册或储存卡的权限。
- 点“拍照”会调起手机系统相机，拍完自动送入处理页。不会索取相机权限，由系统相机应用处理。
- 左右旋转按钮按 90 度改变预览和导出方向，不重新分析图片，也不清除之前画的局部修正。
- 导出 PNG 保存到系统相册的 `Pictures/LiMo` 文件夹。
- 图片分析仍在本机完成，没加入 OCR、统计分析、联网或云上传。
- 格线分析已优化扫描内存访问，原图与优化后生成的格线掩码、笔迹保护数据和输出像素一致。桌面开发机实测约快 2.1 倍；不同手机和照片上的速度有所不同。
- 点击“清除残线”笔刷会改写刷过区域；请避开手写笔迹。
- 选择“保护笔迹”或“清除残线”时，预览自动显示覆盖区域：橙色为算法去格、蓝色为手动保护、玫红为手动清除；覆盖色不会写入导出的 PNG。

直接将 APK 传到手机安装。若 Android 拦截安装，到“设置 > 安全”允许当前文件管理应用安装未知应用。首次安装可能提示应用未经过 Play Protect 审核。

源码项目在 `android-app`，用 Android API 35 编译，最低支持 Android 8.0，可安装在 Android 16。APK 使用本机 debug 签名用于侧载，不是 Play 商店发布签名。

重新同步网页源码并构建 Debug APK：

```powershell
.\build-apk.ps1
```

构建机需要 JDK 17+ 与 Android SDK Platform 35 / Build Tools 35；运行脚本会先同步页面资源，再通过项目内的 Gradle Wrapper 构建 Debug APK。

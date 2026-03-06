# 手动按钮 + 检测：上游同步说明

## 目标

- 通过 GitHub Actions 手动点击按钮执行同步。
- 先检测 `upstream/main` 是否已经被 fork 的 `main` 包含。
- 只有在上游有新提交时才真正同步，并在成功后自动触发 `docker.yml`。
- 同步时保留 fork 的 sidecar / gateway 定制，尽量避免与上游核心文件产生冲突。

## 工作流

文件：`.github/workflows/sync-upstream-manual.yml`

触发方式：GitHub Actions 页面手动执行 `sync-upstream-manual`

可选输入：

- `upstream_ref`：默认 `main`
- `target_branch`：默认 `main`
- `publish_docker`：默认 `true`

## 检测逻辑

工作流会执行以下判断：

```bash
git merge-base --is-ancestor upstream/main origin/main
```

- 返回 0：说明 fork 当前分支已经包含 upstream 最新提交，直接退出。
- 返回非 0：说明 upstream 有新代码，进入同步步骤。

## 同步策略

不是直接做普通 `git merge`，而是采用“上游基线 + fork 覆盖路径”的方式：

1. 以 `upstream/main` 作为新的同步基线。
2. 把 fork 需要长期保留的路径从当前 `main` 覆盖回来。
3. 生成一个同时引用 `fork/main` 和 `upstream/main` 的合成提交。
4. 推送到 fork 的目标分支。
5. 如启用 `publish_docker=true`，自动派发 `docker.yml`。

## 始终保留 fork 版本的路径

- `gateway/`
- `docker-compose.yml`
- `.dockerignore`
- `.gitignore`
- `.github/workflows/docker.yml`
- `.github/workflows/sync-upstream-manual.yml`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/MANUAL_UPSTREAM_SYNC.md`
- `docs/SIDECAR_ARCHITECTURE.md`

其余核心代码默认优先跟随 upstream。

## 使用建议

- 日常只需要在 GitHub Actions 中手动点击一次按钮。
- 如果 Summary 显示 `already up to date`，说明无需任何处理。
- 如果 Summary 显示 `synced`，随后等待 `docker.yml` 构建并推送最新镜像即可。
- 如果未来上游修改了 fork 保留路径附近的约定，再调整工作流中的 `KEEP_PATHS` 即可。

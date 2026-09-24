# hxyfront-62012 纺织染整 · 色差复评台

源提示词编号：7

在原有小样页基础上补齐为色差复评台：连续评多块新样，规范灯箱选择、标准板读数与温湿度登记、双人双测与仲裁复评流程。

## 业务规则

1. 每次评色先选灯箱（D65 / TL84 / CWF / A / UV），并登记标准白度板读数与环境温湿度。
2. 三道门控：灯箱校准在有效期内、标准板读数 ΔE 不超允差、温度 18~26℃ 且湿度 45%~75%。
3. **校准过期或读数越限时只挂“待校色”（calibration-hold），系统不会给出通过结论。**
4. 两名评色员在同一灯箱下分别测量：
   - 两人 ΔE 都 ≤ 0.8 且结论一致 → 通过；
   - 两人都超限 → 不通过；
   - 一人合格一人超限（结果不一致）→ 进入仲裁，两份原始记录都保留，由仲裁员第三次测量给出终判。
5. 配方、后整理或克重修改后生成新版本：旧评色存档可查，批次与订单筛选里的通过状态自动重新判定为“待复评”。
6. 批次列表、超限数、订单通过率、Lab 对比随登记 / 仲裁 / 改版同步更新。

## 三层结构

| 层 | 目录 | 职责 |
| --- | --- | --- |
| 判定 | `src/domain/` | 类型、ΔE*ab（CIE76）、门控、双人判定、仲裁、版本与有效状态推导（纯函数） |
| 存档 | `src/archive/` | 外部 store（`useSyncExternalStore`）、localStorage 持久化、评色登记 / 仲裁落库 / 改版 / 重新校准 / CSV 导出、种子数据 |
| 页面交互 | `src/ui/`、`src/App.tsx` | 批次列表、订单与状态筛选、灯箱校准台、复评操作区、Lab 实时对比、批次档案与历史版本 |

关键模块：

- `domain/rules.ts`：`checkGates` / `adjudicate` / `resolveArbitration` / `effectiveStatus` / `versionViews`
- `archive/store.ts`：`registerEvalSession` / `resolveSessionArbitration` / `reviseBatch` / `recalibrate`
- `ui/ReevalConsole.tsx`：选灯箱、读数登记、双人测量、门控提示、Lab 对比、仲裁、本版记录

## 技术栈

React 19 + Vite + TypeScript（无后端，localStorage 存档；侧栏可一键恢复演示数据）

## 本地运行

```bash
npm install
npm run dev
```

开发端口：62012

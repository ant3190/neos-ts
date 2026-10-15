# 对战界面与 MDPro3 操作流程

分支：`feat/mdpro3-duel-parity`，继承原实验分支的对局逻辑与事件表现。

## 当前界面

按最新反馈改为平面场地和平铺手牌，不再使用 MDPro3 的透视相机、扇形手牌、圆形阶段入口或大尺寸阶段弹层。

- 场地采用正交坐标；双方同类卡片尺寸一致，高度只用于遮挡排序，不影响大小。
- 手牌水平排列，无旋转、下垂或悬停位移。抽卡、检索及离开手牌时，已有手牌仅沿水平方向补位，保持牌序和遮挡顺序；超过 10 张时逐步压缩间距。长手牌仍支持横向拖动，拖动结束不发送选卡响应。
- 阶段入口为紧凑横条，显示回合号和当前阶段，点击打开阶段列表。合法性及 idle/battle 回传编码仍由服务端指令决定。
- 右下角按钮使用屏幕像素坐标，统一 44×44 点击区、图标、间距和面板风格。菜单与按钮处于相同坐标层，不受场地缩放影响。
- 决斗菜单包含动画质量选择、自动说明开关和投降确认，避免缩放后的按钮配上未缩放的默认下拉菜单。
- 说明、卡堆、日志、聊天和选择窗口保留原有用途；点击空白场地关闭说明与卡堆并恢复日志。
- 选牌弹窗取消区域分页，场上、墓地、卡组等候选牌在同一横排中按服务端顺序展示；卡片上方标明我方/对方和区域，并以蓝/红标签区分归属。连锁仍先按卡片合并多个效果。
- 候选、已选择和必选素材的牌列支持鼠标滚轮、触控板及键盘滚动。多排信息出现时弹窗向上增高，屏幕空间足够时完整显示；只有达到可见区域上限后才启用纵向滚动，操作按钮保留在底部。
- 连锁的多效果与普通效果选择使用一致的可换行大字号，按场地缩放补偿至至少 18 屏幕像素。长效果列表通过鼠标滚轮纵向浏览。
- 左侧说明在实时卡片状态缺少静态文本时从卡片数据库补齐。后续效果询问始终在正文显示提示，并展示相关卡片的完整效果；卡片描述编号与系统提示编号分别解析，空的 `strN` 槽回退到完整卡片说明。

## 动画调整

- 弹窗通过 flex 布局定位，关闭 Ant Design 的默认缩放动画；内容只短暂淡入，定位不再与进场动画争用 transform。右键或 Escape 的场地查看模式继续保留，不会提交选择。
- 卡片首次渲染前建立源姿态，后续移动统一由同一队列驱动。手牌偏移只在实际拖动且卡片空闲时更新，不在挂载或窗口测量时重置正在进行的动画。
- 移动使用连续的平滑弧线，去掉落位后的第二次归零动画。降低离地幅度，移动途中保持稳定遮挡层级。
- 悬停/选中反馈使用边框，不再与召唤位移叠加抬升动画。立即落位会停止旧补间，防止旧帧重新写回位置。
- 破坏、解放、素材、送墓、除外、返回、衍生物、表示形式变化仍按区域和原因分流；减少动态效果、后台与停帧兜底继续保留。
- 临时公开卡面与隐藏的协议卡号分开持有，动画结束恢复隐藏状态；无效、连锁和战斗表现跟随实际规则事件。

## 保留的操作规则

- 卡片附近的合法操作按发动、攻击、表示形式、特殊召唤、通常召唤、盖放排序；多卡/多效果先选卡，再选效果。
- 超量怪兽可查看素材；卡堆支持单列/三列和滚动。卡堆/附加效果与日志互相让位，关闭后恢复。
- 连锁时点直接循环智能、全部、忽略；A/S/D 快捷键保留。普通 Tab 保留浏览器焦点导航。
- 原始 PLAYER_HINT 添加/移除按玩家去重；卡片记录按 UUID 跟踪，禁止查看墓地的提示即时生效。
- 阶段与卡片操作发送前同步消费当前指令，避免重复响应或旧弹窗回答新指令。
- 新局和退出清理旧弹窗、拖动、临时卡面、附加效果和展示队列。

## 对照来源

操作及事件规则参考 [MDPro3 官方仓库](https://code.moenext.com/sherry_chaos/MDPro3) 的固定提交 [`e177cd8d53092ae9249e37b38d3cef0040e41095`](https://code.moenext.com/sherry_chaos/MDPro3/-/tree/e177cd8d53092ae9249e37b38d3cef0040e41095)，包括 `GameCard.cs`、`DuelButton.cs`、`DuelMessage.cs`、`MessageProcessor.cs`、`CardList.cs`、`OcgCoreUI.cs` 与相关 UI 预制体。没有引入 Unity、模型、粒子或 AssetBundle。

## 验证

```bash
npx tsc --noEmit
npm run lint
npm run build
./node_modules/.bin/esbuild tests/duel-pacing.test.mjs tests/mdpro3-experience.test.mjs tests/mdpro3-parity.test.mjs tests/card-animation.test.mjs tests/eventbus.test.mjs tests/local-id.test.mjs --bundle --platform=node --format=esm --out-extension:.js=.mjs --outdir=/tmp/neos-parity-tests
node --test /tmp/neos-parity-tests/*.test.mjs
npm run test:e2e -- tests/e2e/duel-polish.spec.ts tests/e2e/duel-selection-polish.spec.ts tests/e2e/duel-effect-text.spec.ts tests/e2e/mdpro3-parity.spec.ts tests/e2e/mdpro3-duel.spec.ts tests/e2e/duel-pacing.spec.ts tests/e2e/duel-dialog-regression.spec.ts tests/e2e/adaptive-scale.spec.ts --workers=1
```

新增浏览器回归逐帧检查双方抽卡/检索时已有手牌保持同一基线和牌序，检查跨区同排、双方标记、两类滚轮滚动、多排窗口增高及缩放后的效果字号；同时检查召唤路径单调、途中卡片尺寸恒定、结束没有跳回；检查弹窗淡入时边界固定、场地查看不会提交；并在桌面与竖屏验证按钮和菜单的实际屏幕尺寸。其他回归覆盖连锁、无效、选择、卡堆、阶段编码、重开清理和停帧处理。文字回归使用灰流丽、增殖的G、流天类星龙和死亡导游的完整效果文本，并检查缺失静态说明、无卡图确认、卡片效果编号及空描述槽的显示。没有测量用户设备的实际帧率。

## 部署

在服务器现有仓库目录执行：

```bash
git fetch origin
git switch feat/mdpro3-duel-parity
git pull --ff-only origin feat/mdpro3-duel-parity
docker compose up --build -d
```

端口仍为 `18080`。

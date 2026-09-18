# PROGRESS — 当たり判定シミュレーター

このファイルは開発の進捗・つまずき・判断の記録用。作業するたびに追記する。

- リポジトリ: https://github.com/gyaruweijing-tech/Collision-Sim
- 公開予定URL: https://gyaruweijing-tech.github.io/Collision-Sim/
- 作業ブランチ: `claude/spec-review-prep-cd7rsg`
- 最終更新: 2026-09-18

---

## 0. 現在のステータス

| フェーズ | 状態 |
|---|---|
| 仕様レビュー（穴出し） | ✅ 完了（本ファイル 2章） |
| 質問への回答待ち | ⏳ 進行中 |
| Step1 床・壁・プレイヤー・スティック・カメラ | ⬜ 未着手 |
| Step2 基本形5種 | ⬜ 未着手 |
| Step3 凸包・複合形・ドーナツ・ハンマー | ⬜ 未着手 |
| Step4 ズレ体験オブジェクト | ⬜ 未着手 |
| Step5 UI・接触演出 | ⬜ 未着手 |
| Step6 GitHub Pages デプロイ | ⬜ 未着手 |

---

## 1. 環境メモ

- Node v22 / npm 10（Vite 7 が動く）
- Rapier は **WASM**。`@dimforge/rapier3d-compat` は base64 埋め込み版なので Vite の追加設定は不要だが、**`await RAPIER.init()` が必須**。
- 実機確認は `npm run dev -- --host` + スマホから同一LAN、または Pages のプレビューで行う想定。

---

## 2. 仕様書の穴・リスク（全18件）

「穴」＝このまま作ると手が止まる／作り直しになる箇所。★は着手前に決めないと詰むもの。

### ★A. 操作系の根本的な矛盾：「離すと止まる」vs「ぶつかったら押し返される」
- **問題**：dynamic body で「スティックを離したら即止まる」を実現する素直な方法は毎フレーム `setLinvel()` で速度を直接上書きすること。しかしそれをやると、敵にぶつかられても速度が毎フレーム上書きされるので **プレイヤーは一切押し返されなくなる**。仕様の中核体験（押し返される）が死ぬ。
- **対応案**：目標速度への「差分インパルス」方式にする。
  `impulse = (targetVel - currentVel) * mass * k`（k は 0.2 程度）を毎フレーム加える。
  さらに linearDamping を 4〜6 に設定。これなら離すと1〜2フレームで減速して止まり、かつ衝突時は押し返される（k<1 なので外力が残る）。
  加速力に上限を設けて、壁に押し付けたときにめり込まないようにする。

### ★B. 見た目と判定の「意図しないズレ」が混入するリスク（学習教材として致命的）
- **問題**：この教材の価値は「見た目＝判定」が正しいことの対比にある。なのに Three.js と Rapier で**寸法の定義が違う**ジオメトリが複数ある。
  - Capsule: Three `CapsuleGeometry(radius, length)` の length は**円筒部の全長**。Rapier `capsule(halfHeight, radius)` の halfHeight は**円筒部の半分**。→ `length = halfHeight * 2`。間違えると2倍ずれる。
  - Cylinder: Three は `height`（全長）、Rapier は `halfHeight`。
  - Cone: Three `ConeGeometry` は**高さの中心**が原点だが、Rapier の cone も中心原点。ただし重心は底寄りなので、debugRender と見た目の一致は要目視確認。
  - Box: Three は全辺長、Rapier は **half-extents**。
- **対応案**：形状定義を**1箇所のファクトリ関数**（`shapes.ts`）に集約し、`{ geometry, colliderDesc }` をペアで返す。個別に手書きしない。Step2 の最初に「判定表示ONで全種類が一致しているか」の目視チェックを必ず入れる。

### ★C. 物理ステップとリフレッシュレートの不一致
- **問題**：Rapier のデフォルトは 1/60 秒固定。`requestAnimationFrame` ごとに `world.step()` すると、**120Hz のスマホでは物理が2倍速**になる。最近の iPhone/Android は120Hz が普通。低FPS時は逆にスローになる。
- **対応案**：アキュムレータ方式で固定タイムステップ。1フレームあたり最大3ステップでクランプ（スパイラル・オブ・デス防止）。`world.timestep = 1/60` を明示。

### ★D. 衝突イベントの有効化が仕様から漏れている
- **問題**：Rapier は黙っていては衝突イベントを出さない。`ColliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)` を対象コライダーに設定し、`world.step(eventQueue)` に `EventQueue` を渡し、`eventQueue.drainCollisionEvents()` で読む必要がある。設定を忘れると「光らない」だけで原因が分かりにくい。
- **対応案**：全オブジェクトに COLLISION_EVENTS を付与。ハンドル→オブジェクト の `Map` を持ち、イベントの collider handle から逆引きする。

### ★E. 「白く光る」実装でマテリアル共有の罠
- **問題**：パフォーマンスのためにマテリアルを種類ごとに共有すると、1体が接触したとき**同じ種類の全部が光る**。
- **対応案**：マテリアルはインスタンスごとに生成（数十個なら問題なし）。`emissive` を白にして 0.2秒で 0 に戻す方式（base color は触らない）。多重ヒット時はタイマーをリセットするだけにする。複合形（雪だるま等）は**body単位で全メッシュを光らせる**。

### ★F. `convexHull` は null を返しうる
- **問題**：`ColliderDesc.convexHull(points)` は点群が退化していると `null` を返す。型は `ColliderDesc | null`。無視すると実行時に落ちる。
- **対応案**：null チェックしてフォールバック（cuboid）。凸包の点群は固定の頂点リスト（ダイヤ型8〜10点）をハードコードし、ランダム生成しない。

### ★G. trimesh（ドーナツ）の制約
- **問題**：(1) Rapier の trimesh は **dynamic body では正しく動かない**（慣性テンソルが出ない）。仕様どおり固定なのでOKだが、将来動かしたくなったら不可。(2) trimesh は**薄い殻**なので、高速なオブジェクトが貫通しやすい。(3) THREE.TorusGeometry から頂点を取るには `index` 必須（非インデックスなら自前で連番を作る）。(4) セグメント数を上げると三角形が増えて重い。
- **対応案**：`TorusGeometry(1.2, 0.45, 12, 24)` 程度に抑える（576三角形）。trimesh には CCD を効かせられないので、穴を通る体験は低速前提と割り切る。頂点抽出ヘルパを共通化。

### ★H. 低い壁だと物体が場外に逃げる
- **問題**：「外周を囲む**低い**壁」＋「ランダムにインパルス」だと、軽い球が壁を越えて永久に飛んでいく。プレイヤーも押されて落ちうる。10分放置で敵が0体になる。
- **対応案**：(1) 見た目は低い壁のまま、**見えない高い壁**（高さ8程度の invisible collider）を外周に追加。(2) 加えて毎秒の境界チェックで、y < -5 または |x|,|z| > 20 の body は初期位置へテレポート（速度リセット）。

### ★I. ランダムインパルスの強さが質量依存で破綻する
- **問題**：同じインパルス値を「小さい球」と「ダンベル（球2＋円柱）」に加えると、速度が数倍違う。片方は飛び跳ね、片方は動かない。
- **対応案**：インパルスを `mass * 目標速度変化` でスケールする。間隔は 1.5〜3秒のランダム、水平方向のみ（上方向成分なし、跳ね回り防止）。中心へ弱く引き戻すバイアスを入れて、隅に溜まるのを防ぐ。

### ★J. スライダーの「作り直し」でメモリリークと数の爆発
- **問題**：(1) 種類は敵9種＋ズレ3種＋ハンマー。各5体だと 45〜60 body、うち trimesh が5つ。スマホで重い可能性。(2) 作り直すたびに geometry / material / RigidBody を捨てないとリークする。
- **対応案**：(1) スライダーは「**ランダム移動する敵の各種類の個数**」だけに適用。ハンマー（2〜3本固定）・ドーナツ置物・ズレ体験3種は**常に1個ずつ固定**とする（比較用なので増やす意味がない）。→ 最大でも 7種×5 + 6 ≒ 41 body。(2) `world.removeRigidBody()` + `geometry.dispose()` + `material.dispose()` を必ず行う `despawnAll()` を用意。

### ★K. debugRender のバッファ更新方法
- **問題**：`world.debugRender()` は毎フレーム **新しい Float32Array**（vertices/colors）を返す。長さはオブジェクト数で変わる。THREE の BufferAttribute を使い回すと長さ不一致で描画が壊れる。
- **対応案**：長さが変わったときだけ `setAttribute` で作り直し、同じなら `array.set()` + `needsUpdate = true`。LineSegments は `depthTest: false` で常に手前に描く（中に隠れて見えないのを防ぐ）。OFF時は `world.debugRender()` 自体を呼ばない（コストが高い）。

### ★L. スティックの方向とカメラの向きの対応が未定義
- **問題**：斜め見下ろしカメラだと、ワールドの +Z が画面の「下」とは限らない。スティックを上に倒したのに斜めに動く、という違和感が出る。
- **対応案**：カメラの forward/right をXZ平面に投影して正規化し、**カメラ基準**で移動方向を作る。カメラは向きを固定（プレイヤー位置だけ追従＝lerp）にして、回転させない。

### ★M. スマホのブラウザ挙動（触ると即バグる系）
- **問題**：スティックをドラッグするとページがスクロールする／引っ張って再読み込みされる／ダブルタップで拡大する／`100vh` がアドレスバーで狂う／ノッチにUIが隠れる。
- **対応案**：
  - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`
  - CSS: `html,body{margin:0;height:100dvh;overflow:hidden;overscroll-behavior:none;touch-action:none;-webkit-user-select:none}`
  - canvas と操作系は `touchstart/​touchmove` で `preventDefault()`、Pointer Events（`setPointerCapture`）で統一実装。
  - UI に `env(safe-area-inset-*)` のパディング。
  - `resize` だけでなく `orientationchange` / `visualViewport` でもカメラ aspect を更新。

### ★N. 縦持ちだと見える範囲が狭すぎる
- **問題**：同じ FOV だと縦持ち（aspect < 1）で横方向の視野が極端に狭くなり、周りの敵が見えない。
- **対応案**：aspect に応じてカメラ距離（または FOV）を調整。`fov` を垂直基準ではなく「水平視野が一定になる」よう補正する。縦持ち時はカメラを少し引く。

### ★O. WASM ロード中の空白画面
- **問題**：`RAPIER.init()` は非同期。読み込み中は真っ白で、遅い回線では「壊れた」と思われる。ビルドサイズも Rapier だけで 1MB 超。
- **対応案**：HTML に静的なローディング表示を置き、初期化完了で消す。初期化失敗時はエラーメッセージを表示（黙って落とさない）。

### ★P. リセットの「初期配置」の定義が曖昧
- **問題**：敵の配置がランダムなら、リセットは「同じ配置に戻す」のか「新しくランダム配置し直す」のか。比較実験の教材としては**毎回同じ配置**の方が価値が高い。
- **対応案**：シード付き乱数（mulberry32 等）を使い、配置は固定シードから生成。リセット＝同じシードで再配置。スライダー変更時も同じシードを使う。

### ★Q. GitHub Pages のデプロイ設定の落とし穴
- **問題**：(1) `base` はリポジトリ名と**大文字小文字まで一致**が必要 → `base: '/Collision-Sim/'`（`collision-sim` ではない）。(2) `actions/deploy-pages` はリポジトリ設定で Pages のソースを "GitHub Actions" にしていないと失敗する。これは**ワークフローからは自動設定できない**（手動操作が必要）。(3) workflow に `permissions: pages: write, id-token: write` が要る。(4) 404 の原因になりがちなので、アセットパスは全て相対/base経由にする。
- **対応案**：workflow を用意したうえで、リポジトリ設定の手動手順を README と本ファイルに明記する。

### R. 依存バージョンの非互換
- **問題**：Rapier は 0.11→0.14 で API が変わっている（`world.step(eventQueue)` の扱い、`RAPIER.init()`、`debugRender()` の有無）。`^` 指定だと将来ビルドが壊れる。
- **対応案**：`@dimforge/rapier3d-compat` と `three` をマイナー固定（`~`）で入れ、動作確認したバージョンを本ファイルに記録する。

### S. 性能の逃げ道が未定義
- **問題**：「最大数でカクつかない」が完了条件だが、達成手段が書かれていない。
- **対応案**：`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`、影は使わない（またはライトのみ簡易）、`antialias` は DPR>1 なら false、マテリアルは `MeshLambertMaterial` 相当の軽量なもの、trimesh は1個のみ。FPS 表示を debug モードに付けて実測する。

---

## 3. 実装方針（決定事項）

- 構成: `src/main.ts` / `physics.ts` / `shapes.ts` / `objects.ts` / `player.ts` / `input.ts`（stick+keys）/ `camera.ts` / `ui.ts` / `debugDraw.ts` / `rng.ts`
- すべて素の TypeScript + DOM。UIフレームワークは入れない（シンプルさ優先）。
- 各ステップ終わりでコミット。

---

## 4. 作業ログ

### 2026-09-18
- リポジトリ確認。仕様書 `collision-sim-spec.md` のみ存在。
- 仕様レビュー実施、穴18件を洗い出し（本ファイル2章）。
- PROGRESS.md 作成。実装開始前にユーザーへ確認事項を提示。

---

## 5. ユーザー確認済みの決定事項（2026-09-18）

| 論点 | 決定 |
|---|---|
| 穴A 操作感 | **両立（差分インパルス＋damping）**。離すと止まる／ぶつかると押し返される を両方成立させる |
| 穴J スライダー適用範囲 | **ランダム移動する敵7種のみ**（球・箱・カプセル・円柱・円錐・凸包・複合形）。ドーナツ置物／ハンマー／ズレ体験3種は1個固定 |
| 穴P リセット挙動 | **毎回新しいランダム配置**（シード固定はしない） |
| 「余裕があれば」項目 | **両方とも今回実装する** — 検知のみモード（sensor切替）＋ CCD弾（高速弾＋CCD ON/OFF） |

### 決定にともなう追加仕様
- UI は 判定表示 / 検知のみ / CCD / 数スライダー / リセット / 弾を撃つ の6要素。画面上部に小さく収める（縦持ちで溢れないよう折り返し）。
- 「検知のみモード」ON 時は全ての敵コライダーを `setSensor(true)` に切替。プレイヤーは敵をすり抜けるが光る。床・壁は sensor にしない（落下防止）。
- 弾は小さい球の dynamic body。CCD OFF だと薄い壁や trimesh ドーナツを貫通する。弾は5秒で自動消滅（無限に増やさない）。

## 6. ユーザーに手動でお願いする作業

1. **GitHub Pages の有効化**（ワークフローからは自動設定できない）
   リポジトリ → Settings → Pages → Source を **"GitHub Actions"** に変更。
   これをしないと deploy ワークフローが失敗する。

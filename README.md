> Video demo: (sẽ cập nhật ở Phase 4)

# Đảo Đèn Lồng (Lantern Island)

Trò chơi 3D nhỏ viết bằng TypeScript + Three.js. Bạn điều khiển **Mây**, cô bé giữ đèn của một hòn đảo giữa biển
mây. Sương đen đã nuốt hết ánh sáng của đảo: hãy nhặt các đốm sáng (đom đóm), mang về thắp lại **5 Đèn Lồng
Lớn**, tránh các **Bóng Mực** đang đuổi theo, và toả sáng (pulse) để đẩy chúng ra. Thắp hết đèn là thắng, hết
ngọn lửa là thua.

Dự án có thêm **chế độ headless** (không cửa sổ, không GPU) chạy cùng một lõi mô phỏng và ghi kết quả ra JSONL
theo Test Contract v1.0 (`docs/spec/contract-v1.0.md`).

> Trạng thái: Phase 1 hoàn tất (Đêm 1 chơi được: nhặt đốm sáng, nạp đèn, Bóng Mực, pulse, thắng/thua, tính điểm).
> Lõi headless đã có Đêm 1-3, lướt, tạm dừng, gió, Gió Lạc; chưa có trên web (phase sau): menu/âm thanh, chơi Đêm 2-3.

## Yêu cầu hệ thống

- Node.js 20 trở lên (đã thử trên Node 24), npm.
- Để chơi: trình duyệt bất kỳ có WebGL2 (Chrome, Edge, Firefox, Safari).
- Để chạy bench: Chrome, Chromium hoặc Edge đã cài (không cần cài thêm gói npm). Có thể chỉ đường dẫn bằng biến môi trường `CHROME_PATH`.

## Cài đặt & chạy (3 lệnh)

```bash
git clone <URL-repo-của-bạn>
cd <thư-mục-repo>
npm ci && npm run build && npm run play
```

`npm run play` chạy launcher `node dist/play.js`: phục vụ bản web `dist/web` tại `http://127.0.0.1:4173/` (nếu bận thì cổng kế tiếp tới 4183) và tự mở trình duyệt (`--no-open` để tắt). Có thể chọn seed: `http://127.0.0.1:4173/?seed=7`.

### Bảng xếp hạng (lưu trên đĩa)

Launcher lưu bảng xếp hạng tại `data/leaderboard.json` (cạnh `dist/`; thư mục `data/` tạo khi cần và nằm trong `.gitignore`; đường dẫn in ra khi khởi động). Máy chủ có `GET /api/leaderboard` và `POST /api/leaderboard` (kiểm tra tên 3–12 ký tự chữ/số/`_`, có tiếng Việt có dấu; giữ top 10, điểm giảm dần, hoà thì ai đạt trước đứng trên). Màn hình Bảng xếp hạng trong menu thuộc Plan 07.

Xuất bảng (không bật máy chủ):

```bash
node dist/play.js --export-leaderboard out.json    # ghi {"entries": [ ... ]} đúng thứ tự, in số mục
node dist/play.js --leaderboard-file khac.json --export-leaderboard out.json   # đọc file lưu khác
```

## Điều khiển

| Phím | Việc |
|---|---|
| W A S D / phím mũi tên | Di chuyển (theo hướng camera) |
| Space | Nhảy |
| Shift | Lướt (dash) |
| E | Tương tác (nạp ánh sáng vào đèn lồng) |
| F | Toả sáng (pulse) |
| H | Đom đóm dẫn đường (sáng tạo của tôi, hồi 10 s) |
| P / Esc | Tạm dừng (menu: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu); Esc cũng đóng màn Cài đặt |
| `[` `]` hoặc kéo chuột | Xoay camera (độ nhạy chuột chỉnh trong Cài đặt) |
| C | Bảng màu dễ phân biệt (cũng có trong Cài đặt) |
| R | Chơi lại Đêm đang chơi |

Menu chính: Bắt đầu (Đêm 1 → 2 → 3 → màn Bình Minh với tổng điểm), Chọn Đêm (luyện tập), Cài đặt (âm lượng, độ nhạy chuột, bảng màu; lưu lại trong `localStorage`, khoá `dao-den-long.settings.v1`).
Thêm `?fps=1` vào địa chỉ để hiện bộ đếm FPS (trung bình 2 giây gần nhất). Số đo đã ghi: `docs/proof/manual-measurements.md`.

(Plan gốc ghi Q/E để xoay camera, nhưng E đã dùng cho tương tác nên camera dùng `[` `]` và kéo chuột.)

## Phạm vi Phase 2

Phase 2 triển khai lõi headless của Contract v1.1 cho Đêm 1: lướt (dash), tạm dừng (pause), Bùa Gió (wind charm), sự kiện `night_start`, sự kiện rơi đổi sang `lost`, và định dạng snapshot v1.1.
Hoàn thiện phase 2 (lõi headless): `--night 1|2|3` với ba hòn đảo — Đêm 1 Đảo Bến, Đêm 2 Đảo Cau (hai đảo nối bằng cầu tre, hai bục nhảy), Đêm 3 Đảo Chuông (ba tầng, dốc, bục nhảy, tháp chuông, gió mạnh) — cùng Gió Lạc (drifters), Bóng Mực theo từng Đêm. Chi tiết: `CHANGELOG.md`, `docs/spec/acceptance-phase2.md`.
Phần web (Plan 05): luồng 3 Đêm có lời Ông Đăng, menu tạm dừng, cài đặt lưu lại, nhạc nền và hiệu ứng âm thanh tổng hợp bằng WebAudio, HUD đầy đủ, vẽ Đêm 2–3 (hai đảo và cầu tre, ba tầng, dốc, tháp chuông, Gió Lạc, Bùa Gió, lá gió). Còn lại: chưa có gì trong phạm vi Phase 2; mọi mục web chỉ kiểm tra tay (xem `docs/spec/acceptance-phase2.md` mục 3.12).

## Chế độ headless

```bash
node dist/headless.js --seed 1 --night <1|2|3> --ticks 600 --out out/a.jsonl \
  [--scenario kịch-bản.json] [--inputs đầu-vào.json] [--snapshot-every 10]
```

- 60 tick/giây, 1 tick = 1/60 s. `--ticks N` chạy đúng N bước (hoặc dừng sớm khi thắng/thua).
- Mỗi dòng đầu ra là một JSON: `snapshot` (mỗi `--snapshot-every` tick, bắt đầu từ tick 0), `event`, và dòng
  `end` cuối cùng.
- Cùng seed + scenario + inputs cho đầu ra **giống nhau từng byte**.
- Mã thoát: `0` thành công, `1` dùng sai lệnh / không đọc được file, `2` file scenario hoặc inputs sai định dạng.

Ví dụ với kịch bản mẫu của contract:

```bash
node dist/headless.js --seed 7 --night 1 \
  --scenario tests/scenarios/contract-sample/scenario.json \
  --inputs tests/scenarios/contract-sample/inputs.json \
  --ticks 300 --out out/demo.jsonl
tail -1 out/demo.jsonl
```

## Kiểm thử

```bash
npm test          # build headless + Vitest (unit, CLI, kiểm tra kiến trúc)
npm run verify    # build + test + chạy mọi tests/scenarios/* hai lần, so sánh từng byte
```

`npm run verify` ghi báo cáo vào `docs/proof/verify-latest.md` và `docs/proof/phase-1.md` (yêu cầu → test/kịch bản → kết quả + mã commit; file tự sinh, không sửa tay).

## Bench (hiệu năng)

```bash
npm run build
node scripts/bench.mjs --seed 42 --duration 30 --out bench.json
```

Script phục vụ `dist/web`, mở Chrome/Chromium/Edge đã cài (cửa sổ 1280x720 tại (0,0), có đầu, không toàn màn hình, hồ sơ tạm mới) vào trang `?bench=1&seed=42&duration=30`, rồi ghi `bench.json` và in tóm tắt với ngưỡng. Cảnh bench: Đêm 1 đầy đủ hiệu ứng, đèn L1–L3 sáng đầy dầu, đúng 200 Bóng Mực `wander` và 100 đom đóm rải đều; không sinh thêm, không sát thương, không nhặt, không hao dầu, không hết Đêm; Mây đứng yên ở (0,0,0); camera bay vòng bán kính 30 m, cao 15 m, 15 s một vòng, xuất phát (30,15,0). 3 s đầu khởi động (không đo), sau đó đo đúng `--duration` giây. Máy tính của người chấm mới là số tính điểm.

| Khoá | Ý nghĩa | Ngưỡng đạt |
|---|---|---|
| `avg_fps` | 1000·N / Σdt | >= 60 |
| `p1_low_fps` | 1000 / trung bình k giá trị dt lớn nhất, k = max(1, ceil(N/100)) | >= 30 |
| `frame_ms_p95` | phân vị 95 của dt (nearest-rank), ms | (không có ngưỡng) |
| `frames` | số khung hình trong khoảng đo | |
| `load_ms` | từ lúc script bắt đầu tới khung hình đầu tiên của cảnh bench | <= 10000 |
| `peak_mem_mb` | RSS cao nhất của cây tiến trình trình duyệt trong khoảng đo (`null` trên Windows) | |
| `vsync_off` | luôn `true`: cờ `--disable-gpu-vsync --disable-frame-rate-limit` đã được YÊU CẦU | |
| `renderer`, `os` | GPU (WebGL) + phiên bản three.js; hệ điều hành, CPU, RAM | |

`vsync_off: true` nghĩa là yêu cầu đã được gửi chứ không đảm bảo: trình duyệt/hệ điều hành (nhất là macOS) vẫn có thể giữ tốc độ làm tươi của màn hình, khi đó `avg_fps` bị chặn ở tần số màn hình. Đừng đo khi máy đang ở chế độ tiết kiệm pin.

## Soak (chạy lâu)

```bash
node --expose-gc dist/soak.js --seed 7 --nights 10 --out soak.json [--verbose]
```

Chạy 10 Đêm liên tiếp trong một tiến trình (Đêm 1 → 2 → 3 xoay vòng, Đêm thứ i dùng seed 7 + i) với input ngẫu nhiên theo seed (đổi hướng mỗi 30 tick; mỗi tick 5% nhảy, 3% lướt, 2% pulse, 10% tương tác). Ghi `{"contract_version", "nights", "crashes", "results", "mem_start_mb", "mem_end_mb", "duration_s"}`; `--verbose` in từng Đêm (`đêm seed kết-quả số-tick`). Ngưỡng đạt: `crashes` = 0 và `mem_end_mb` <= 1.2 × `mem_start_mb` (RSS sau khi tải Đêm đầu, và sau khi thả Đêm cuối rồi `gc()`; cần `--expose-gc`). Lệnh luôn thoát mã 0 trừ khi dùng sai lệnh (mã 1); file là bằng chứng. Chi tiết: `docs/notes/assumptions.md`, mục "Phase 4".

## Cách tính điểm

Điểm lấy từ `game.contract.json` → `tuning.score`. Luật thật (Contract v1.2, cài trong `src/core/sim.ts`):

| Sự kiện | Điểm |
|---|---|
| Nạp đốm sáng vào đèn lồng, hoặc châm dầu cho đèn đang sáng (mỗi đốm, lúc nạp; **không** phải lúc nhặt) | 5 |
| Thắp sáng một đèn lồng lần đầu (đủ 10 đốm) | 100 |
| Thắp lại một đèn đã từng sáng (đủ 5 đốm) | 40 |
| Mỗi Bóng Mực bị choáng bởi pulse (thêm 10 nếu nó đang hút đèn) | 5 (hoặc 15) |
| Thắng lúc bình minh: mỗi đèn còn sáng | 50 + phần nguyên của nhiên liệu còn lại |
| Thắng lúc bình minh: mỗi ngọn lửa còn lại | 50 |

- Đèn có nhiên liệu 0..100, tự hao 1/giây; mỗi đốm châm thêm 10. Hết nhiên liệu thì đèn tắt và mất số đốm đã nạp. Nhiên liệu < 30 thì đèn mất vùng an toàn và bị Bóng Mực hút thêm 5/giây.
- Không còn thắng sớm: Đêm kéo dài 240 s. Hết giờ mà có ít nhất 3/5 đèn sáng thì thắng (`dawn_survived`), ngược lại thua (`dawn`); hết ngọn lửa là thua (`no_flames`, xét trước cả ở tick bình minh). Thua thì không có điểm thưởng cuối, không còn thưởng theo giây.
- Đèn sáng sẵn từ kịch bản không cho điểm (nhưng vẫn tính vào thưởng bình minh nếu còn sáng).
- Sức chứa: 10 + 2 cho mỗi lần thắp thành công, tối đa 20.
- Mất 1 ngọn lửa khi bị Bóng Mực chạm (rơi một nửa số đốm đang mang) hoặc rơi khỏi đảo (mất hết đốm).
- Pulse tốn 3 đốm, bán kính 5 m, choáng 2 s, hồi 3 s. Vùng an toàn quanh đèn sáng (nhiên liệu ≥ 30) bán kính 6 m: Bóng Mực không vào được.
- Chi tiết từng luật và giả định: `docs/notes/assumptions.md`, mục "Phase 1 — luật chơi" và "Phase 3 — Đèn cạn dầu".

## Giải thích tuning

Mọi giá trị trong `game.contract.json` được chọn trùng với các số chuẩn sẽ công bố ở Ticket-02, để các phase sau
xây tiếp mà không phải sửa lại. Không có khoá nào là `null`: game dùng đủ mọi khái niệm của contract.
`fall_enabled = true` vì người chơi có thể rơi khỏi mép đảo (không có tường chắn); hình phạt rơi: mất 1 ngọn lửa và hết đốm đang mang.
Chi tiết từng con số và các hằng số của bản đồ nằm ở `docs/notes/assumptions.md`.

## Sáng tạo của tôi

**Đom đóm dẫn đường** (phím `H`, chỉ có trên web).

- Là gì: bấm `H`, trong 3 giây một dải khoảng 12 đom đóm nhỏ bay từ Mây về phía đèn lồng cần giúp gần nhất (chưa sáng, hoặc đang sáng nhưng nhiên liệu dưới 30; không đèn nào cần thì chỉ về đèn sáng gần nhất). Dải dài tối đa 30 m để còn rõ hướng đi. Hồi 10 giây tính từ lúc bấm, biểu tượng `H` ở góc dưới phải HUD hiện thời gian hồi.
- Vì sao: Đêm 2 (hai đảo) và Đêm 3 (ba tầng, tháp chuông che tầm nhìn) rộng, người chơi dễ lạc; mũi tên mép màn hình chỉ hướng đèn chưa sáng, còn đom đóm chỉ cả đèn sắp hết dầu và đi theo địa hình.
- Bằng chứng lõi không đổi: tính năng chỉ ĐỌC `game.state` (`src/extras/guide.ts`, `src/web/render.ts`), không ghi gì vào lõi và không đi qua `step()`; `src/extras` không bao giờ được CLI headless nạp. `tests/guards/night1-golden.test.ts` vẫn so khớp từng byte 5 lần chạy Đêm 1 với `tests/golden/`, và `tests/guards/architecture.test.ts` chặn mọi import ngược từ `src/core` và `src/headless` vào `web`/`extras`. Phần chọn đích và vòng hồi có test ở `tests/unit/web-guide.test.ts`.
- Cách thử: `npm run play`, chọn Đêm 2 hoặc 3 trong "Chọn Đêm", bấm `H`.

## Cấu trúc dự án

```
game.contract.json     số liệu tuning + lệnh build/run/headless (nguồn duy nhất cho mọi con số tuning)
src/core/              lõi mô phỏng thuần TypeScript (step(), rng, level, input, scenario, tuning)
src/headless/          CLI headless (args.ts, cli.ts) -> dist/headless.js
src/web/               giao diện Three.js + HUD (dùng lại đúng core/step())
src/extras/            phần sáng tạo, chỉ chạy trên web, headless không bao giờ nạp
tests/                 unit, cli, guards (kiến trúc) và tests/scenarios/<tên>/{scenario,inputs}.json
scripts/               build-headless.mjs, verify.mjs, hooks/stop-gate.sh
docs/spec, docs/plans  đặc tả (PRD-0, Test Contract) và kế hoạch triển khai
docs/notes             giả định và quyết định (assumptions.md)
docs/proof             báo cáo tự sinh bởi npm run verify
AGENTS.md, CLAUDE.md, .claude/, .github/   harness cho AI và CI
```

Giấy phép: MIT (`LICENSE`). Ghi công: `CREDITS.md`.

> Video demo: (sẽ cập nhật ở Phase 4)

# Đảo Đèn Lồng (Lantern Island)

Trò chơi 3D nhỏ viết bằng TypeScript + Three.js. Bạn điều khiển **Mây**, cô bé giữ đèn của một hòn đảo giữa biển
mây. Sương đen đã nuốt hết ánh sáng của đảo: hãy nhặt các đốm sáng (đom đóm), mang về thắp lại **5 Đèn Lồng
Lớn**, tránh các **Bóng Mực** đang đuổi theo, và toả sáng (pulse) để đẩy chúng ra. Thắp hết đèn là thắng, hết
ngọn lửa là thua.

Dự án có thêm **chế độ headless** (không cửa sổ, không GPU) chạy cùng một lõi mô phỏng và ghi kết quả ra JSONL
theo Test Contract v1.0 (`docs/spec/contract-v1.0.md`).

> Trạng thái: Phase 1 hoàn tất (Đêm 1 chơi được: nhặt đốm sáng, nạp đèn, Bóng Mực, pulse, thắng/thua, tính điểm).
> Chưa có (phase sau): lướt (dash), tạm dừng, Đêm 2-3, gió, menu/âm thanh.

## Cài đặt & chạy (3 lệnh)

```bash
git clone <URL-repo-của-bạn>
cd <thư-mục-repo> && npm ci && npm run build
npm run play
```

Cần Node.js 20 trở lên (đã thử trên Node 24). Có thể chọn seed: `http://localhost:4173/?seed=7`.

## Điều khiển

| Phím | Việc |
|---|---|
| W A S D / phím mũi tên | Di chuyển (theo hướng camera) |
| Space | Nhảy |
| Shift | Lướt (dash) |
| E | Tương tác (nạp ánh sáng vào đèn lồng) |
| F | Toả sáng (pulse) |
| P / Esc | Tạm dừng |
| `[` `]` hoặc kéo chuột | Xoay camera |
| R | Chơi lại |

(Plan gốc ghi Q/E để xoay camera, nhưng E đã dùng cho tương tác nên camera dùng `[` `]` và kéo chuột.)

## Phạm vi Phase 2

Phase 2 triển khai lõi headless của Contract v1.1 cho Đêm 1: lướt (dash), tạm dừng (pause), Bùa Gió (wind charm), sự kiện `night_start`, sự kiện rơi đổi sang `lost`, và định dạng snapshot v1.1.
Chưa làm (chưa đạt trong phase này): Đêm 2 và Đêm 3 (tiếp tục báo lỗi mã 1), hành vi và mô phỏng Gió Lạc (drifters), gió môi trường, bục nhảy, cầu, tầng, menu/cài đặt/âm thanh/HUD đầy đủ/chế độ hỗ trợ mù màu.

## Chế độ headless

```bash
node dist/headless.js --seed 1 --night 1 --ticks 600 --out out/a.jsonl \
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

(Chưa có — sẽ bổ sung ở phase sau, kèm bằng chứng ngắn rằng phần lõi vẫn chạy đúng. Mọi phần mở rộng chỉ chạy
trên web, không được làm đổi đầu ra headless.)

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

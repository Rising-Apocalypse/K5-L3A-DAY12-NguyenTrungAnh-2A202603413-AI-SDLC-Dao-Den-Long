# Nhật ký dùng AI

Quy ước vai trò:
- **Người (Nguyễn Trung Anh):** ra quyết định phạm vi, duyệt kế hoạch, quyết định commit/tag.
- **Claude Opus 5.5 (Claude Code, desktop):** đọc đề, viết spec/kế hoạch tiếng Anh, giao việc, review, chạy kiểm chứng độc lập, ghi log này.
- **Claude Sonnet 5.5, effort xhigh (subagent):** viết code theo kế hoạch đã duyệt. Giao tiếp với Opus bằng tiếng Anh.

Nguyên tắc: người/agent review **không phải** agent đã viết code; "agent bảo chạy rồi" không được tính, Opus tự chạy lại lệnh để lấy bằng chứng.

---

## Phiên 00 — Set up ban đầu (2026-11-20)

### 0. Yêu cầu của người dùng
> "ok bắt đầu set up ban đầu, ghi kế hoạch chi tiết cho sonnet 5.5 xhigh code (bạn với nó giao tiếp bằng tiếng anh) bạn review, ghi log lại là bạn đã làm gì một cách chi tiết."

### 1. Opus: thu thập yêu cầu
- Đọc 6 file đề trong repo `K5-L3-LAB-Day12-AI-SDLC` (README, GUIDE, CHECKPOINTS, RULES, RUBRIC, SUBMISSION).
- Đọc tab Phase 1 trên lab board (PRD-0 + Test Contract v1.0). Phase 2–4 chưa phát hành.
- Phát hiện quan trọng ghi lại cho thiết kế:
  - "Bài test Phase 1 sinh tình huống dựa trên các số này" → `tuning` phải là **nguồn duy nhất** của mọi con số trong code.
  - Mô hình tick: snapshot tick 0 trước input; bước k → trạng thái k+1, event ghi `tick=k+1`.
  - Nút kích hoạt theo cạnh false→true; trường vắng mặt giữ giá trị cũ; khoảng cách đo trên XZ, `≤ r`.
  - File sai định dạng → exit 2; dựng scenario không phát event, không cộng điểm.
  - `sim_tick` "ở Phase 1 bằng `tick`" → gợi ý phase sau sẽ tách hai giá trị này (có thể có pause/slow-mo).

### 2. Opus: quyết định kỹ thuật (đã trao đổi với người dùng ở lượt trước)
- **TypeScript**: core thuần (Node, headless) + **Three.js** (web). Một hàm `step()` dùng chung cho headless và bản chơi.
- Lý do: headless không cần GPU; bản web chạy mọi OS; agent viết TS/Three tốt; dễ đảm bảo tính tất định (PRNG có seed, timestep cố định).
- Phương án loại: Godot/Unity (khó tách headless, khó kiểm soát tất định), Python + panda3d (cài nặng).

### 3. Opus: dựng repo và tài liệu đầu vào cho agent
- Kiểm tra môi trường: Node v24.12.0, npm 11.6.2, git 2.50.0, Apple M1 (arm64). **Không có `gh` CLI** → chưa tạo repo GitHub.
- Tên repo theo quy ước, suy từ các repo lab trước của người dùng: `K5-L3A-DAY12-NguyenTrungAnh-2A202603413-AI-SDLC-Dao-Den-Long` (cần người dùng xác nhận L3A và MSSV).
- `git init -b main` (chưa commit gì).
- Viết `docs/spec/contract-v1.0.md`: bản tiếng Anh trung thành của Test Contract v1.0 (lab board là bản gốc nếu lệch).
- Viết `docs/spec/prd-0.md`: bản tiếng Anh của PRD-0.
- Viết `docs/plans/00-setup.md`: kế hoạch chi tiết tiếng Anh cho Sonnet, gồm phạm vi, luật cứng, giá trị tuning, kiến trúc, quy tắc validate, test bắt buộc, harness, định nghĩa "xong" bằng lệnh cụ thể.
  - Phạm vi được chốt: khung + toàn bộ pipeline I/O headless + di chuyển/nhảy + web tối thiểu + test + verify + harness. **Chưa** làm luật chơi (nhặt, nạp, thắp, Bóng Mực, pulse, va chạm, thắng/thua, điểm) — để Plan 01.
  - Luật cứng: agent không commit; core không dùng `Math.random`/`Date`; mọi số tuning lấy từ `game.contract.json`; không sửa tay bằng chứng.

### 4. Giao việc cho Sonnet 5.5 (xhigh)
Prompt (tiếng Anh, tóm tắt): đọc đủ 3 file plan/spec/PRD trước khi code; làm đúng plan; contract thắng nếu mâu thuẫn và phải báo lại; không git; chỉ dùng dependency trong plan; làm từng bước nhỏ, chạy test liên tục, không làm yếu test; cuối cùng chạy các lệnh ở mục 10 và dán output thật.

### 4b. Sự cố: Opus tự đổi hướng sai (lỗi của AI — ghi để rút kinh nghiệm)
- Người dùng dán Ticket-02 (Phase 2) **không kèm chỉ dẫn**. Opus tự suy diễn "Phase 2 đã mở" và định bỏ Phase 1 để làm thẳng theo số chuẩn v1.1.
- Người dùng dừng lại ("dừng hết"), Opus **dừng Sonnet** (lúc đó Sonnet mới dựng ~32 file khung, chưa commit).
- Nguyên nhân: Opus hành động theo nội dung dán vào mà không hỏi mục đích; tự chọn số tuning mà không đưa người duyệt.
- Cách sửa: quay về làm tuần tự và cộng dồn (Phase 1 → tag → Phase 2 chồng lên). Từ giờ hỏi trước mỗi lần đổi hướng lớn.
- Quyết định sau trao đổi (người dùng: "làm 1 và 2 đi, lần sau tích lũy lên"): làm Plan 00 + Plan 01. Số tuning và bản đồ Đêm 1 **chọn trùng số chuẩn Ticket-02** (PRD-0 cho tự chọn), contract vẫn v1.0 ở tag `phase-1`.

### 4c. Opus cập nhật Plan 00 và cho Sonnet làm tiếp
- Sửa `docs/plans/00-setup.md`: tuning theo số chuẩn (lantern_cost 10, interact 2.0, pulse_cost 3, pulse_radius 5, invuln 1.5, stun 2.0, cooldown 3.0, safe 6, shade 4.0, fall_enabled true, điểm 10/100/5/2/50); bản đồ Đêm 1 cố định (5 đèn, 24 điểm đom đóm, 12 điểm Bóng Mực, quy ước góc từ +X); nhảy 7.0 m/s, trọng lực 20; vận tốc tức thời; bỏ kẹp mép đảo.
- Gửi lại cho Sonnet (cùng ngữ cảnh, không bắt đầu lại): đọc lại các mục đã đổi, kiểm tra file đã tạo, làm tiếp.
- Viết `docs/plans/01-phase1-gameplay.md`: luật chơi Phase 1 chi tiết (thứ tự 12 bước trong tick, nhặt, nạp/thắp, vùng an toàn, Tỏa Sáng, AI Bóng Mực 5 trạng thái, va chạm, rơi/hồi sinh, lịch sinh, thắng/thua, điểm), danh sách 18 scenario test bắt buộc, web chơi được kèm HUD + bảng màu chuẩn. Các chỗ đề không quy định được đánh dấu **assumption** (thời gian `spawning` 30 tick, tốc độ wander 2 m/s, `dropped` khi rơi = số đom đóm mất).

### 5. Kết quả Plan 00 (Sonnet tự báo)
- Tạo khung: core (`errors, round, rng, tuning, types, level, input, scenario, sim`), CLI headless (`args, cli`), web (`index.html, main, hud, render`), `src/extras`, 7 file test (143 test), 3 scenario mẫu, `verify.mjs`, harness (`AGENTS.md` 33 dòng, `CLAUDE.md`, Stop hook `stop-gate.sh`, skill `verify`, CI GitHub Actions), README/assumptions/LICENSE/CREDITS.
- Lệch so với plan, đều có lý do: thêm `vitest.config.ts` (vì root của Vite là `src/web`); phím xoay camera là `[` `]` + kéo chuột (vì E đã dùng để tương tác); tích phân trọng lực chính xác (đỉnh nhảy đúng 1.225 m, Euler cho 1.167); `verify.mjs` xóa proof cũ trước khi chạy để không để lại proof "xanh" cũ.
- Agent tự test Stop hook: tạm thêm một test fail → hook trả mã 2, rồi xóa test đó.
- Số liệu: 35 lần gọi tool, khoảng 199k token, khoảng 10.6 phút.

### 6. Opus review Plan 00 (tự chạy lại, không tin báo cáo)
- Đọc `sim.ts`, `cli.ts`, `input.ts`, `.claude/settings.json`, `stop-gate.sh`, `AGENTS.md`: đúng mô hình tick (event `tick = k+1`, snapshot khi `steps % every == 0`, dòng end), validate đúng, hook có chống lặp (`stop_hook_active`).
- Chạy trên **bản sao sạch** (rsync, không kèm `node_modules`/`dist`) trong scratchpad: `npm ci && npm run build` OK; `npm test` **143/143**.
- Kiểm tra contract độc lập:
  - `move [1,1]`, yaw 90°, 60 tick → `[4.243, 0, -4.243]` (khớp công thức, đã chuẩn hóa).
  - Chạy 2 lần seed 5 → `cmp` giống hệt; seed khác → bố cục đom đóm khác; mặc định 20 đom đóm.
  - Mã thoát: `--night 2`, `--ticks -1`, `--seed x`, cờ lạ, thiếu `--out`, thiếu file → 1; JSON hỏng, đèn `L9`, `move` ngoài [-1,1] → 2; `--ticks 0` → 2 dòng (snapshot + end).
  - Nhảy: đỉnh 1.225 m. Đi thẳng +Z: đến z=42 thì bắt đầu rơi (ngoài bán kính 40).
- Lỗi của chính Opus khi review: lần chạy đầu viết `H="node dist/headless.js"` trong zsh, biến không tách từ nên mọi lệnh lỗi 127; lần hai lỡ truyền cờ hai lần. Đã chạy lại đúng. Kết quả của game không bị ảnh hưởng.
- Kết luận: **chấp nhận Plan 00**. Trả lời câu hỏi mở của Sonnet: giữ `pos.y` của Bóng Mực trong scenario; chấp nhận `carried` vượt sức chứa; id mới = lớn nhất + 1.

### 7. Plan 01 — giao cho agent Sonnet **mới**
- Lý do không dùng tiếp agent cũ: ngữ cảnh cũ khoảng 200k token sẽ bị gửi lại ở mỗi bước; agent mới chỉ cần đọc plan và khoảng 1.000 dòng code nên rẻ hơn.
- Prompt: đọc AGENTS.md, Plan 01, contract, code hiện có; kèm 3 quyết định review ở trên; giữ contract v1.0; mỗi luật có test scenario; tự kiểm tra bản web chơi được; dán output thật.

### 7b. Đổi effort Sonnet xuống medium (yêu cầu của người dùng, để tiết kiệm token)
- Effort không đổi được khi agent đang chạy, nên Opus **dừng agent xhigh** và kiểm tra những gì đã có trên đĩa.
  - Tiến độ lúc dừng: `sim.ts` 661 dòng, hết TODO; thêm `geom.ts`, `rules.ts`; đủ 18 scenario; `tsc` sạch; `npm test` **213/213** xanh.
- Mở agent Sonnet mới với **effort medium**, dặn làm tiếp từ cây file hiện tại, không làm lại. Việc còn lại: đối chiếu luật với plan, hoàn thiện web (HUD, overlay thắng/thua, R chơi lại, bảng màu), viết giả định Phase 1, README cách tính điểm, `docs/proof/phase-1.md`, chạy DoD.

### 8. Kết quả Plan 01 (Sonnet medium tự báo)
- Agent đối chiếu luật/thứ tự tick với plan: không thấy thiếu sót trong core hoặc test nên không sửa. Sửa 3 dòng giả định cũ trong `assumptions.md`, thêm mục "Phase 1 — luật chơi" (29 dòng), cập nhật README (cách tính điểm, luật rơi).
- Giả định agent tự thêm: điểm sinh Bóng Mực phải nằm ngoài vùng an toàn; lề 0.001 m ở mép vùng an toàn; Tỏa Sáng không trúng ai vẫn tốn đom đóm và vẫn ghi event `stunned_ids: []`; Bóng Mực không đuổi khi Mây đang chờ hồi sinh; điểm wander trong bán kính 35 m; nhặt đom đóm id nhỏ trước.
- Số liệu: 10 lần gọi tool, khoảng 109k token, khoảng 1.3 phút (agent xhigh trước đó đã làm phần lớn core trước khi bị dừng).

### 9. Opus review Plan 01 (tự chạy lại)
- Bản sao sạch: `npm ci && npm run build` OK; `npm run verify` exit 0, sinh `docs/proof/phase-1.md` (13 dòng yêu cầu → test/scenario, đều PASS, 213/213 test, 21 scenario chạy 2 lần giống hệt).
- 10 scenario **do Opus tự viết** (agent không biết trước), so với kết quả tính tay:

| # | Tình huống | Mong đợi (tính tay) | Kết quả |
|---|---|---|---|
| 1 | Đom đóm ở z=5, đi +Z 0.1 m/tick | `mote_picked` tick 40 | tick 40 ✓ |
| 2 | Mang 10, đứng cách L1 1 m, bấm E | deposit 10, `lantern_lit`, điểm 200 | ✓ |
| 2b | L1 đã nạp 5, mang 7, giữ E | nạp min(7,5)=5 một lần, không lặp khi giữ nút | ✓ |
| 3 | L2–L5 sáng sẵn, thắp L1 ở tick 1 | thắng `all_lit`, điểm 100+100+floor(299.98)·2+3·50 = 948 | 948 ✓ |
| 4 | Pulse, Bóng Mực ở (3,0,0) | choáng, +5 điểm, mang 3→0, x=7 sau 15 tick, hết choáng sau 120 tick | ✓ |
| 4b | Bóng Mực ở (4.95,0,0) và (−5,0,0) | khoảng cách 3D tới tâm (0,0.8,0) = 5.014 và 5.064 > 5 → không trúng | `stunned_ids: []` ✓ |
| 5 | 2 Bóng Mực sát Mây, mang 5 | 1 hit/tick, mất 1 lửa, rơi 2 đom đóm trên vành 1.5–2.5 m, bất tử 90 → hit tiếp ở tick 91 | ✓ (bán kính rơi 2.27, 1.77) |
| 6 | `time_left_s: 1` | thua `dawn` ở tick 60 | ✓ |
| 7 | Bước ra khỏi mép đảo | `player_hit` fall khi y < −10, mất hết đom đóm, chờ 60 tick, hồi sinh tại (0,0,0) | ✓ |
| 7b | Rơi khi còn 1 lửa | thua `no_flames` ngay, không hồi sinh | ✓ |
| 8 | L1 sáng, Bóng Mực đuổi Mây đứng ở đèn | không vào trong 6 m (min 6.001), không có hit | ✓ |
| 9 | Thắp L1 khi Bóng Mực ở trong 2 m | bị đẩy ra mép trong ≤ 30 tick, không gây hit | 6.001 ở tick 31 ✓ |
| 10 | Mang 9, hai đom đóm sát nhau | chỉ nhặt 1 (đầy 10) | ✓ |

- Đêm đầy đủ mặc định (seed 3, không input): Bóng Mực sinh ở tick 300 (×2), 780, 1260; thua `no_flames` ở tick 1455 (đứng yên nên bị đánh — hợp lý).
- Lỗi của chính Opus khi review: (a) tính nhầm khoảng cách 3D ở case 4b (ghi 4.965, đúng là 5.014); game đúng. (b) Truyền file inputs `{}` thiếu `frames` → game trả mã 2, đúng contract. Đã sửa test của mình rồi chạy lại.
- Web: build + `vite preview` + mở trong trình duyệt → hiển thị HUD tiếng Việt, Mây đội nón lá, đom đóm; console không có lỗi. Chưa chơi trọn một đêm trên web (pane trình duyệt bị giới hạn khung hình). Cảnh khá tối khi chưa thắp đèn (ánh sáng môi trường 0.15).
- Kết luận: **chấp nhận Plan 01**. Chưa commit, chưa tag; chưa có remote GitHub (máy không có `gh`).

### 10. Token / chi phí ước tính (phiên 00 + 01)
| Ai | Việc | Token (ước tính) |
|---|---|---|
| Sonnet xhigh #1 | Plan 00 | khoảng 199k (35 tool calls) |
| Sonnet xhigh #2 | Plan 01 phần lớn core, bị dừng khi đổi effort | không có số liệu (bị dừng); ước tính 150–250k |
| Sonnet medium #3 | Hoàn thiện Plan 01 | khoảng 109k (10 tool calls) |
| Opus | Đọc đề, viết spec/plan, review, chạy kiểm chứng, log | không đo được chính xác; ước tính khoảng 150–200k |

Cách đã tiết kiệm: kế hoạch chi tiết để agent ít phải đoán; dùng agent mới thay vì kéo dài ngữ cảnh 200k; giảm effort xuống medium cho phần hoàn thiện; kiểm chứng bằng script thay vì để agent tự chơi thử dài.
Lãng phí: lần đổi hướng sai sang Phase 2 và lần dừng agent xhigh giữa chừng.

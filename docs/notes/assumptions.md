# Giả định và quyết định

Mọi điều contract chưa nói rõ được quyết định ở đây. Lý do chung cho các con số: **"chọn trùng số chuẩn
Ticket-02"**, để các phase sau không phải sửa lại.

## Tuning (`game.contract.json`)

| Khoá | Giá trị | Lý do |
|---|---|---|
| `player_speed` | 6.0 m/s | chọn trùng số chuẩn Ticket-02 |
| `carry_capacity` | 10 | chọn trùng số chuẩn Ticket-02 |
| `lantern_cost` | 10 | chọn trùng số chuẩn Ticket-02 |
| `lantern_count_night1` | 5 | contract quy định |
| `pickup_radius` | 1.0 m | chọn trùng số chuẩn Ticket-02 |
| `interact_radius` | 2.0 m | chọn trùng số chuẩn Ticket-02 |
| `pulse_cost` | 3 | chọn trùng số chuẩn Ticket-02 |
| `pulse_radius` | 5.0 m | chọn trùng số chuẩn Ticket-02 |
| `night1_duration_s` | 300 s | chọn trùng số chuẩn Ticket-02 |
| `flames` | 3 | chọn trùng số chuẩn Ticket-02 |
| `invuln_s` | 1.5 s | chọn trùng số chuẩn Ticket-02 |
| `hit_drop_ratio` | 0.5 | chọn trùng số chuẩn Ticket-02 |
| `pulse_stun_s` | 2.0 s | chọn trùng số chuẩn Ticket-02 |
| `pulse_push_m` | 4.0 m | chọn trùng số chuẩn Ticket-02 |
| `pulse_cooldown_s` | 3.0 s | chọn trùng số chuẩn Ticket-02 |
| `safe_radius` | 6.0 m | chọn trùng số chuẩn Ticket-02 |
| `shade_speed` | 4.0 m/s | chọn trùng số chuẩn Ticket-02 |
| `shade_hit_radius` | 1.0 m | chọn trùng số chuẩn Ticket-02 |
| `fall_enabled` | true | người chơi rơi khỏi mép đảo (không có tường chắn); phạt rơi làm ở plan-01 |
| `score.per_mote` | 10 | chọn trùng số chuẩn Ticket-02 |
| `score.per_lantern` | 100 | chọn trùng số chuẩn Ticket-02 |
| `score.per_stun` | 5 | chọn trùng số chuẩn Ticket-02 |
| `score.per_second_left` | 2 | chọn trùng số chuẩn Ticket-02 |
| `score.per_flame_left` | 50 | chọn trùng số chuẩn Ticket-02 |

Không khoá nào là `null`: game dùng đủ mọi khái niệm của contract.

## Hằng số bản đồ và vật lý (không phải khoá contract; nằm ở `src/core/level.ts`)

| Hằng số | Giá trị | Lý do |
|---|---|---|
| `ISLAND_RADIUS` | 40 m, tâm (0,0,0) | đảo tròn; chọn trùng số chuẩn Ticket-02 |
| Vị trí người chơi lúc đầu | (0,0,0), nhìn về +Z | contract quy định điểm xuất phát |
| Đèn L1..L5 | `[0,0,25]`, `[23.8,0,7.7]`, `[14.7,0,-20.2]`, `[-14.7,0,-20.2]`, `[-23.8,0,7.7]` | bản đồ chuẩn Ticket-02 |
| 24 điểm sinh đốm sáng | 8 điểm r=12 (0°,45°,…,315°) + 16 điểm r=33 (0°,22.5°,…,337.5°) | bản đồ chuẩn Ticket-02 |
| Số đốm sáng lúc đầu | 20, chọn từ 24 điểm bằng xáo trộn Fisher–Yates theo seed (luồng `"motes"`) | bản đồ chuẩn Ticket-02; id `M1..M20` theo thứ tự chọn |
| 12 điểm sinh Bóng Mực | r=37 tại 15°,45°,…,345° | bản đồ chuẩn Ticket-02 |
| Bóng Mực lúc đầu | không có (sinh theo lịch ở plan-01) | bản đồ chuẩn Ticket-02 |
| `SHADE_HOVER_Y` | 1.0 m | tâm Bóng Mực lơ lửng cách đất 1 m |
| `JUMP_SPEED` | 7.0 m/s | chọn trùng số chuẩn Ticket-02 |
| `GRAVITY` | 20 m/s² | chọn trùng số chuẩn Ticket-02; đỉnh nhảy = 7²/(2·20) = 1.225 m |

## Quyết định

- **Quy ước góc:** góc đo từ +X trên mặt phẳng XZ; điểm ở góc a, bán kính r là `[r·cos a, 0, r·sin a]`
  (90° → +Z).
- **Gia tốc tức thời:** vận tốc đặt ngay bằng `hướng · player_speed` (tăng/dừng trong 0 s, thoả "≤ 0.1 s");
  điều khiển được cả khi ở trên không. Hướng nhìn = hướng di chuyển khác 0 gần nhất (ban đầu +Z).
- **Không chặn mép đảo:** quá `ISLAND_RADIUS` thì không còn mặt đất và người chơi tiếp tục rơi; chỉ hạ cánh
  khi XZ nằm trên đảo (khoảng cách ≤ `ISLAND_RADIUS`) và đang ở trên mặt đất. Phạt rơi / hồi sinh (y < -10)
  đã làm ở Phase 1.
- **Nhảy:** tích phân chính xác cho trọng lực không đổi (`y += v·dt − ½g·dt²`), nên đỉnh nhảy đúng bằng
  `JUMP_SPEED²/(2·GRAVITY)`. Chỉ nhảy khi cạnh lên (false → true) của `jump` và đang trên mặt đất.
- **`move` ngoài [−1, 1]** (ví dụ `[2, 0]`) → file inputs bị coi là sai định dạng → thoát mã 2. Vector dài hơn 1
  nhưng mỗi thành phần hợp lệ (ví dụ `[1, 1]`) được chuẩn hoá về độ dài 1.
- **Khoá lạ** trong inputs/scenario được bỏ qua, không lỗi.
- **File không tồn tại / không đọc được** (`--scenario`, `--inputs`) → thoát mã 1; JSON hỏng hoặc sai định dạng → mã 2.
  Thiếu cờ bắt buộc, cờ lạ, cờ lặp, giá trị không phải số nguyên, `--night` khác 1 → mã 1.
- **Tên trạng thái Bóng Mực:** `spawning`, `wander`, `chase`, `recoil`, `stunned`. Bóng Mực liệt kê trong
  scenario bắt đầu ở trạng thái `wander` (hoạt động ngay, không qua `spawning`; cập nhật ở Phase 1).
- **Bóng Mực trong scenario:** `pos` dùng nguyên văn (kể cả y). Id lấy theo `id` nếu có, ngược lại là `S<n>`
  nhỏ nhất chưa dùng theo thứ tự liệt kê. Hai Bóng Mực trùng `id` → scenario sai định dạng (mã 2). Bộ đếm id
  cho `shade_spawned` sau này là (số lớn nhất đã dùng) + 1, không bao giờ tái sử dụng id.
- **Đèn trong scenario:** id phải dạng `L<số>`; id không tồn tại trong đảo (ví dụ `L9`) → mã 2 khi dựng màn.
  `carried` lớn hơn `carry_capacity` trong scenario không bị từ chối (dùng nguyên văn).
- **Đốm sáng trong scenario** thay hẳn danh sách mặc định, id `M1..` theo thứ tự liệt kê, `pos` dùng nguyên văn.
- **Thời gian:** `time_left_s = thời gian đầu − số bước/60` tính từ số nguyên; luật bình minh (`dawn`) đã làm ở Phase 1
  (ván dừng khi `time_left_s ≤ 0`).
- **Làm tròn:** chỉ khi xuất (toạ độ và `time_left_s` về 3 chữ số, `-0` thành `0`); trạng thái bên trong giữ đủ
  độ chính xác. JSON ghi số theo kiểu JavaScript (`25`, không phải `25.0`).
- **Ngẫu nhiên:** mỗi hệ con một luồng riêng (`"motes"`, `"shades"`, `"extras"`) suy ra từ seed bằng FNV-1a, nên thêm
  số ngẫu nhiên ở một hệ con không làm lệch hệ khác. Seed được lấy theo `seed >>> 0` (mod 2³²).
- **Extras:** giao diện `Extra` đặt ở `src/core/types.ts` (core không được import `src/extras`);
  `src/extras/index.ts` xuất lại và giữ `EXTRAS`. Headless không bao giờ truyền extras.
- **Web:** trục x của contract nằm bên TRÁI của camera nhìn dọc +Z (hệ toạ độ tay phải, Y hướng lên), nên phím
  "sang phải" gửi `x = -1`. Xoay camera dùng `[` `]` và kéo chuột vì E đã dùng cho tương tác.

## Phase 1 — luật chơi

- **Chiến lược:** chọn luật trùng với luật chuẩn khách hàng sẽ công bố ở Phase 2, để các phase sau chỉ thêm tính năng; contract giữ v1.0.
- **Đơn vị thời gian:** mọi bộ đếm (bất tử 90, choáng 120, hồi pulse 180, …) là số nguyên tick, đổi từ giây bằng `Math.round(s·60)` đúng một lần.
- **Thứ tự một tick:** 11 giai đoạn cố định (đầu vào, bộ đếm, di chuyển, nhặt, tương tác, vùng an toàn, pulse, Bóng Mực, va chạm, sinh, thắng/thua), mỗi giai đoạn một hàm trong `sim.ts`.
- **Nhặt đốm sáng:** cần XZ ≤ `pickup_radius` và |Δy| ≤ 1.5 (`PICKUP_MAX_DY`); đốm id nhỏ nhất nhặt trước; không nhặt khi đang chờ hồi sinh.
- **Đốm rơi:** nhặt được từ tick sau khi tạo (vì giai đoạn nhặt chạy trước va chạm).
- **Trần đốm sáng:** `MOTE_CAP` = 30 đốm đang hoạt động; sinh ngẫu nhiên tại tick 240, 480, … chỉ khi chưa đủ trần và có điểm sinh trống (không có đốm nào trong 0.01 m).
- **Đốm rơi khi bị đánh:** `floor(carried·hit_drop_ratio)` đốm, góc ngẫu nhiên, bán kính [1.5, 2.5] quanh Mây, y = 0, sống 480 tick (luồng `"drops"`).
- **Nạp đèn:** chọn đèn CHƯA sáng gần nhất trong `interact_radius`, hoà thì id nhỏ hơn; nạp `min(carried, lantern_cost − deposited)`; số 0 thì không có sự kiện.
- **Vùng an toàn:** Bóng Mực ngoài vùng không bao giờ kết thúc bước đi trong vùng (bị kéo ra mép, cộng thêm 0.001 m để làm tròn 3 chữ số không làm trông như ở trong).
- **Đuổi khỏi vùng mới sáng:** Bóng Mực đang trong vùng khi đèn vừa sáng bị đẩy ra mép trong ≤ 30 tick, vô hại, tên trạng thái giữ nguyên; trùng tâm thì đẩy về +X.
- **Đèn sáng sẵn từ scenario:** sáng từ tick 0, không thưởng điểm; Bóng Mực đặt trong đó bị đuổi ra từ bước 0.
- **Pulse:** tâm = chân Mây + 0.8 theo Y; mục tiêu tính bằng khoảng cách 3D tới tâm Bóng Mực, trừ `spawning`; choáng 120 tick, đẩy 4 m trong 15 tick đầu (cùng vị trí XZ thì đẩy về +X); choáng lại thì làm mới.
- **Pulse không đủ điều kiện:** thiếu đốm hoặc đang hồi thì không làm gì, không có sự kiện; trúng 0 mục tiêu vẫn có sự kiện `pulse` với mảng rỗng và vẫn trừ đốm.
- **`SHADE_SPAWNING_TICKS` = 30:** trạng thái `spawning` kéo dài 30 tick, đứng yên, vô hại.
- **Đi lang thang:** 2.0 m/s tới điểm ngẫu nhiên trong bán kính 35 m quanh tâm đảo, chọn lại khi cách ≤ 1 m, sau 180 tick, hoặc khi vùng an toàn chặn (luồng `"shade_ai"`).
- **Đuổi theo:** phát hiện ở XZ ≤ 12, bỏ đuổi khi > 18; khi Mây đang chờ hồi sinh thì Bóng Mực không đuổi.
- **Va chạm:** chỉ Bóng Mực `wander`/`chase` không đang bị đuổi khỏi vùng; XZ ≤ `shade_hit_radius` và |Δy| ≤ 1.5; tối đa 1 lần/tick, id nhỏ trước; bất tử 90 tick; Bóng Mực đó lùi 2 m trong 60 tick (`recoil`) và vô hại.
- **Bóng Mực giữ độ cao của mình:** y không đổi khi di chuyển (sinh ở y = 1.0).
- **Rơi:** y < −10 trừ 1 ngọn lửa một lần mỗi lần rơi, kể cả khi đang bất tử; mất hết đốm đang mang, `dropped` của sự kiện `fall` báo số đốm mất (v1.0 không có trường riêng).
- **Hồi sinh:** chờ 60 tick (không nhặt, nạp, pulse, không bị đánh), rồi về (0,0,0), vận tốc 0, bất tử 90 tick; hết ngọn lửa thì thua, không hồi sinh.
- **Lịch sinh Bóng Mực:** tại tick 300 sinh 2 con, rồi 1 con mỗi 480 tick (780, 1260, …), tối đa 6; điểm sinh phải cách Mây ≥ 15 m (XZ) và nằm ngoài mọi vùng an toàn đã sáng (giả định thêm); không có điểm hợp lệ thì bỏ qua.
- **Sinh thực thể:** thực thể mới chỉ tham gia từ tick kế tiếp; Bóng Mực mới có id `S<n>` tăng dần, không dùng lại.
- **Kết thúc:** thứ tự `no_flames` → `all_lit` → `dawn`; thắng đúng tick hết giờ vẫn là thắng; điểm thưởng `floor(time_left_s)·per_second_left + flames·per_flame_left` cộng trước sự kiện `game_over`.
- **Scenario:** `random_motes`/`random_shades` mặc định true; Bóng Mực liệt kê bắt đầu ở `wander`.
- **Luồng ngẫu nhiên:** thêm `"drops"`, `"shade_ai"`, `"spawn"` (mỗi hệ con một luồng).
- **Web — đèn sáng/tối:** đèn tối phát sáng yếu theo số đốm đã nạp; đèn sáng có vòng sáng vùng an toàn đúng bán kính `safe_radius`.
- **Web — ánh sáng nền:** `0.15 + 0.55·lit/total`; bảng màu theo plan 01.
- **Web — hiệu ứng:** Mây nhấp nháy khi bất tử, màn hình loé đỏ khi bị đánh, Bóng Mực choáng chuyển màu xám; đốm rơi nhấp nháy trong giây cuối.
- **Web — HUD và kết thúc:** gợi ý "E — Nạp ánh sáng (x/10)" khi có đèn chưa sáng trong tầm; bảng thắng/thua hiện điểm cuối và "R — Chơi lại".

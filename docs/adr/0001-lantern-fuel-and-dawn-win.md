# ADR 0001 — Mô hình trạng thái đèn có nhiên liệu và luật thắng "giữ đảo sáng tới bình minh"

- Trạng thái: Đã chấp nhận (Phase 3, Contract v1.2)
- Ngày: 2026-11-20
- Người quyết định: Nguyễn Trung Anh (duyệt), Claude Opus 5.5 (đề xuất)
- Nguồn: Ticket-03 "Đèn cạn dầu" (change request). Kế hoạch triển khai: `docs/plans/03-phase3-fuel-v1.2.md`

## Bối cảnh

Đến Phase 2, đèn có hai trạng thái **chưa sáng → sáng** và trạng thái sáng là vĩnh viễn. Thắp đủ 5 đèn thì
thắng ngay (`all_lit`), có thưởng theo thời gian còn lại. Playtest cho thấy người chơi giỏi thắng sau khoảng
2 phút, nửa cuối Đêm không còn căng thẳng.

Ticket-03 thay ba luật cốt lõi: (1) đèn đã sáng không nhận thêm đom đóm; (2) Bóng Mực không bao giờ vào vùng
an toàn; (3) thắng ngay khi mọi đèn sáng.

## Quyết định

### 1. Đèn trở thành máy trạng thái có nhiên liệu

```
            nạp đủ chi phí (10 nếu chưa từng sáng, 5 nếu ever_lit)
  TẮT ───────────────────────────────────────────────▶ SÁNG (fuel = 100)
   ▲                                                      │
   │  fuel ≤ 0  → deposited = 0, ever_lit = true,         │ mỗi tick: −1/60 (tự hao)
   │              phát lantern_out                        │           −5/60 cho mỗi Bóng Mực đang drain
   └──────────────────────────────────────────────────────┘ châm dầu: +10 mỗi đom đóm, tối đa 100
```

- Thêm vào `LanternState`: `fuelUnits` (số nguyên), `everLit`, `relitCount`. `lit` vẫn giữ để các luật cũ
  (vùng an toàn, điều kiện thắng) đọc được, và luôn khớp `fuelUnits > 0`.
- **Nhiên liệu lưu bằng số nguyên theo đơn vị 1/60** (1.0 fuel = 60 đơn vị, đầy = 6000). Tự hao đúng 1
  đơn vị mỗi tick, bị hút đúng 5 đơn vị mỗi tick. Không có sai số số thực, nên test có thể đoán chính xác tick
  đèn tắt và output luôn tất định. Chỉ làm tròn 1 chữ số thập phân lúc xuất.
- Thứ tự trong tick theo Ticket-02, bổ sung: trừ nhiên liệu ở bước 2 (bộ đếm), **ngay sau bước 2** xét đèn
  tắt. Nhờ vậy đèn tắt trong tick nào thì việc nhặt, tương tác, vùng an toàn và Bóng Mực trong cùng tick đó
  đều thấy đèn đã tắt.

### 2. Vùng an toàn phụ thuộc nhiên liệu

Vùng an toàn chỉ tồn tại khi `lit && fuel ≥ 30` (đúng 30 vẫn còn), thể hiện bằng một hàm `hasSafeZone()` duy
nhất thay cho mọi chỗ trước đây đọc `lit`. "Vùng vừa bật" (đèn vừa thắp, hoặc được châm từ < 30 lên ≥ 30)
dùng lại đúng cơ chế đẩy Bóng Mực ra mép trong ≤ 30 tick của Phase 1, nên không phải viết luật mới.

### 3. Bóng Mực có trạng thái mới `drain`

`wander → drain` khi tới cách đèn yếu ≤ 2 m. Từ `drain` đi tiếp theo thứ tự: `chase` (Mây vào trong 6 m),
`stunned` (trúng Tỏa Sáng, +15 điểm thay vì +5), `wander` (đèn tắt / được châm ≥ 30 / bị kéo ra > 2 m).
`drain` không gây sát thương. Lúc `wander` không thấy đèn yếu thì đi về đèn tắt gần nhất. Ticket gọi đây là
hành vi "như trước", nhưng ở bản của mình là hành vi mới, nên đã ghi giả định.

### 4. Luật thắng chuyển sang bình minh

Bỏ hẳn nhánh `all_lit`. Ở bước xét thắng/thua cuối tick: hết Ngọn Lửa → thua `no_flames` (luôn xét trước,
kể cả ở tick bình minh). Nếu hết giờ: số đèn đang sáng ≥ `ceil(win_ratio × số đèn)` → thắng `dawn_survived`,
ngược lại thua `dawn`. Thưởng thời gian bị bỏ (`per_second_left = 0`). Thưởng bình minh mới là
50 + floor(fuel) cho mỗi đèn sáng, cộng 50 cho mỗi Ngọn Lửa.

### 5. Sức chứa tăng dần

`capacity = min(capacity_max, carry_capacity + 2 × successful_lights)`. `carry_capacity` trong contract vẫn là
mức gốc 10. Mọi chỗ giới hạn việc nhặt đều gọi một hàm `capacity()` duy nhất.

## Hệ quả

- **Phá tương thích:** `contract_version` 1.2; `game_over.reason` không còn `all_lit`; `lantern_lit` có thêm
  `relight`; snapshot đèn thêm `fuel/ever_lit/relit_count`, player thêm `capacity`; điểm và thời lượng Đêm đổi.
  Toàn bộ danh sách nằm trong `CHANGELOG.md`.
- **Test cũ:** các test thắng sớm, điểm cũ, "đèn sáng không nhận đom đóm" và thời lượng 300 s được viết lại
  theo luật mới hoặc xóa kèm lý do trong `CHANGELOG.md` → "Tests updated (phase-3)". Không test nào bị skip.
- **Test ẩn Phase 1–2** không bị thay thế vẫn phải đạt. Các luật nhặt, va chạm, rơi, lướt, tạm dừng và định
  dạng input không đổi.
- **Rủi ro:** việc Bóng Mực đi về đèn tắt làm đổi quỹ đạo `wander` so với Phase 1–2. Một số kịch bản đuổi
  theo có thể khác tick so với trước, nên các test liên quan được cập nhật kèm lý do.

## Phương án đã cân nhắc và loại

- **Nhiên liệu kiểu số thực (giảm 1/60 mỗi tick).** Bị loại vì sau 6000 tick sai số dồn lại có thể làm đèn
  tắt lệch 1 tick so với cách tính của bộ chấm. Ticket cũng khuyên dùng số nguyên.
- **Thêm trạng thái `out` riêng cho đèn.** Bị loại vì `lit=false` cộng `ever_lit=true` đã đủ diễn tả, và giữ
  được định dạng snapshot mà contract quy định.

import zlib, struct, base64

# Exactly render favicon.svg path onto 22x22 PNG grid
# path: viewBox 0 0 32 32 with translate(4, 4), original coords on 24x24 canvas

def create_favicon_png(filename="tray_favicon.png", size=22):
    # RADAS Favicon Pixel Grid scaled for 22x22 PNG icon
    path_bits = [
        (4, 6, 8, 2), (2, 4, 2, 2), (18, 4, 2, 2), # top ears
        (6, 8, 2, 2), (14, 8, 2, 2),
        (2, 8, 2, 2), (18, 8, 2, 2),
        (2, 10, 20, 2), # upper bar
        (2, 12, 20, 8), # main face box
    ]
    # Eye holes: (8, 12, 2, 4) and (14, 12, 2, 4)

    # Let's map pixels on 24x24 canvas
    canvas = [[0 for _ in range(24)] for _ in range(24)]

    # Draw path d="M16 8h2v2h2v2h2v8H2v-8h2v-2h2V8h2V6h8v2Zm-8 8h2v-4H8v4Zm6-4v4h2v-4h-2ZM6 8H4V6h2v2Zm14 0h-2V6h2v2ZM4 6H2V4h2v2Zm18 0h-2V4h2v2Z"
    # Ears:
    for y in range(4, 6):
        for x in range(2, 4): canvas[y][x] = 1
        for x in range(18, 20): canvas[y][x] = 1
    for y in range(6, 8):
        for x in range(4, 6): canvas[y][x] = 1
        for x in range(16, 18): canvas[y][x] = 1
        for x in range(6, 14): canvas[y][x] = 1
    for y in range(8, 10):
        for x in range(2, 4): canvas[y][x] = 1
        for x in range(4, 6): canvas[y][x] = 1
        for x in range(16, 18): canvas[y][x] = 1
        for x in range(18, 20): canvas[y][x] = 1
        for x in range(6, 16): canvas[y][x] = 1
    for y in range(10, 18):
        for x in range(2, 20): canvas[y][x] = 1

    # Punch eye holes: (8, 12) 2x4 and (14, 12) 2x4
    for y in range(12, 16):
        for x in range(8, 10): canvas[y][x] = 0
        for x in range(14, 16): canvas[y][x] = 0

    # Scale 24x24 canvas into 22x22 PNG bytearray with 1px border padding
    raw_data = bytearray()
    for y in range(22):
        raw_data.append(0) # Filter byte
        cy = int(y * 24 / 22)
        for x in range(22):
            cx = int(x * 24 / 22)
            if canvas[cy][cx] == 1:
                raw_data.extend([0, 0, 0, 255]) # Solid black template pixel
            else:
                raw_data.extend([0, 0, 0, 0]) # Transparent

    def chunk(tag, data):
        return (struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xffffffff))

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", struct.pack("!IIBBBBB", size, size, 8, 6, 0, 0, 0)))
    png.extend(chunk(b"IDAT", zlib.compress(bytes(raw_data))))
    png.extend(chunk(b"IEND", b""))

    with open(filename, "wb") as f:
        f.write(png)
    print("Created " + filename)

create_favicon_png("tray_favicon.png", 22)
create_favicon_png("tray_favicon@2x.png", 44)

import zlib, struct, base64

def generate_radas_png(width=18, height=18):
    # RADAS Pixel Logo Grid (18x18)
    # 1 = White/Solid pixel (Menu bar icon), 0 = Transparent
    grid = [
        "000000000000000000",
        "001100000000001100",
        "011110000000011110",
        "011110011110011110",
        "011001111111100110",
        "011011111111110110",
        "011011000000110110",
        "011111000000111110",
        "011111000000111110",
        "011111011001111110",
        "011111011001111110",
        "011111011001111110",
        "011111011001111110",
        "011111111111111110",
        "011111111111111110",
        "001111111111111100",
        "000111111111111000",
        "000000000000000000",
    ]

    raw_data = bytearray()
    for row in grid:
        raw_data.append(0) # Filter type 0
        for ch in row:
            if ch == "1":
                raw_data.extend([0, 0, 0, 255]) # Solid Black for template image tinting
            else:
                raw_data.extend([0, 0, 0, 0]) # Transparent

    def chunk(tag, data):
        return (struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xffffffff))

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)))
    png.extend(chunk(b"IDAT", zlib.compress(bytes(raw_data))))
    png.extend(chunk(b"IEND", b""))

    b64 = base64.b64encode(png).decode('ascii')
    print("BASE64_PNG=" + b64)
    with open("tray_logo.png", "wb") as f:
        f.write(png)

generate_radas_png()

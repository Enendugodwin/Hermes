from PIL import Image
def crop(src, box, out, scale=1.0):
    im = Image.open(src); c = im.crop(box)
    if scale != 1.0: c = c.resize((int(c.width*scale), int(c.height*scale)), Image.LANCZOS)
    c.save(out); print(out, c.size)
crop('deck/shots/calendar-30d.png', (440, 160, 1668, 830), 'deck/assets/crops/calendar.png')
crop('deck/shots/harmonization.png', (1186, 262, 1664, 620), 'deck/assets/crops/score.png', 2)
crop('deck/shots/harmonization.png', (440, 262, 1180, 700), 'deck/assets/crops/assoc.png')

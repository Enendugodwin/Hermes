from PIL import Image
def crop(src, box, out, scale=2):
    im = Image.open(src); c = im.crop(box)
    c = c.resize((int(c.width*scale), int(c.height*scale)), Image.LANCZOS); c.save(out); print(out, c.size)
crop('deck/shots/harmonization.png', (1186, 298, 1664, 620), 'deck/assets/crops/score.png', 2)
crop('deck/shots/calendar-drill.png', (1608, 36, 1914, 430), 'deck/assets/crops/drill.png', 2)
crop('deck/shots/exposure.png', (905, 175, 1668, 520), 'deck/assets/crops/exposure.png', 1.6)

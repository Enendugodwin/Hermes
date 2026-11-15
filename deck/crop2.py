from PIL import Image
im = Image.open('deck/shots/harmonization.png').crop((1186, 272, 1664, 622))
im = im.resize((im.width*2, im.height*2), Image.LANCZOS)
im.save('deck/assets/crops/score.png'); print(im.size)

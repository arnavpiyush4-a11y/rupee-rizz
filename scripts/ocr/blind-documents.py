"""Separate final synthetic set, with unseen vendors, values, serif type and layout."""
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageFilter
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
for i,shop in enumerate(['Dilli Brass Works','Nehru Textile House','Metro Chai','Palam Electronics','Raj Traders','Lajpat Books']):
    typ=['supplier invoice','GST invoice','sales bill'][i%3]
    q=13+i;rate=21+i;net=q*rate;tax=round(net*.05,2);total=round(net+2*tax,2)
    sku=['Bolts','Fabric','Tea','Switch','Paper','Books'][i]
    lang='hi' if i in [2,5] else 'en'
    payment=['cash','digital','udhaar'][i%3]
    day='2026-03-'+str(12+i)
    lines=[shop,'Date: '+day,typ.upper().replace('GST INVOICE','TAX INVOICE'),'Invoice No: ND-'+str(510+i),'Payment: '+{'cash':'Cash','digital':'UPI','udhaar':'Unpaid'}[payment],f'{sku} {q} pcs x {rate}.00 = {net}.00',f'Taxable value: {net}.00',f'CGST 5%: {tax:.2f}',f'SGST 5%: {tax:.2f}',('कुल देय राशि' if lang=='hi' else 'Invoice Total')+f' {total:.2f}']
    image=Image.new('RGB',(850,640),'#f5f1e6');draw=ImageDraw.Draw(image)
    for j,line in enumerate(lines):
        font='/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf' if 'कुल' in line else '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
        draw.text((22+(j>4)*35,18+j*58),line,font=ImageFont.truetype(font,31),fill='#232323')
    if i==1:image=image.rotate(90,expand=True)
    if i==4:image=image.filter(ImageFilter.GaussianBlur(.8))
    image.save(out/f'{i}.png');(out/f'{i}.json').write_text(json.dumps(dict(merchant=shop,date=day,total=total,invoice='ND-'+str(510+i),language=lang,items=[dict(name=sku,quantity=q,price=net)],method=payment,docType=typ)))

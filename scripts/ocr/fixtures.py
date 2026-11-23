"""Generate original synthetic image/label pairs. No personal documents are used."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
root=Path(sys.argv[1])
sets={'train':['Market Grocery','Station Kiosk','Eastern Tools'],'validation':['Harbour Services','City Supplier'],'test':['River Grocer','Bazaar Stall','Lotus Wholesale','Coastal Works','Handloom Repairs','Janata Foods','Utkal Stores','Incomplete Slip']}
sets['unseen']=['Green Valley Traders','Pragati Stores','Konark Print House','Sadar Electricals','Forest Road Bakery','Nalanda Mill','Bharat Tea Shop','Lakeside Tailor']
for split,shops in sets.items():
    path=root/split
    path.mkdir(parents=True,exist_ok=True)
    for i,shop in enumerate(shops):
        lang='hi' if split in ('test','unseen') and i==5 else 'or' if split in ('test','unseen') and i==6 else 'en'
        font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',31)
        scriptfont=ImageFont.truetype('/usr/share/fonts/truetype/noto/'+('NotoSansOriya-Regular.ttf' if lang=='or' else 'NotoSansDevanagari-Regular.ttf'),31) if lang!='en' else font
        kind=['supplier invoice','sales bill','GST invoice'][i%3]
        payment=['Cash','UPI','Unpaid'][i%3]
        qty=(11 if split=='unseen' else 2)+i
        value=qty*20
        date=f'2026-02-{i+10:02}'
        label={'en':'Grand Total','hi':'कुल राशि','or':'ମୋଟ ରାଶି'}[lang]
        invoice=f'AB-{100+i}'
        lines=[shop,kind.upper().replace('GST INVOICE','TAX INVOICE'),'Invoice No: '+invoice,'Date: '+date,'Rice '+str(qty)+' pcs x 20.00 = '+str(value)+'.00','Taxable value: '+str(value)+'.00','CGST 5%: '+f'{value*.05:.2f}','SGST 5%: '+f'{value*.05:.2f}',label+' '+f'{value*1.10:.2f}','Payment: '+payment]
        incomplete=split in ('test','unseen') and i==7
        if incomplete: lines.pop(-2)
        if split=='unseen': lines=[lines[0],lines[3],lines[1],lines[2],*lines[4:]]
        im=Image.new('RGB',(730,610),'white')
        d=ImageDraw.Draw(im)
        for j,line in enumerate(lines):
            d.text((24,20+j*54),line,font=scriptfont if line.startswith(label) else font,fill='black')
        if split in ('test','unseen') and i==2: im=im.rotate(90,expand=True)
        if split in ('test','unseen') and i==3: im=im.filter(ImageFilter.GaussianBlur(0.9)).point(lambda x:int(45+x*.58))
        if split=='train':
            pairs=root/'training-lines'
            pairs.mkdir(exist_ok=True)
            for j,line in enumerate(lines):
                im.crop((12,10+j*54,720,63+j*54)).save(pairs/f'{i}-{j}.png')
                (pairs/f'{i}-{j}.gt.txt').write_text(line,encoding='utf-8')
        im.save(path/f'{i}.png')
        (path/f'{i}.json').write_text(json.dumps(dict(merchant=shop,date=date,total=None if incomplete else round(value*1.10,2),invoice=invoice,language=lang,items=[dict(name='Rice',quantity=qty,price=value)],method={'Cash':'cash','UPI':'digital','Unpaid':'udhaar'}[payment],docType=kind)))

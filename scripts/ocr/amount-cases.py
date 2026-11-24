"""Original evaluation-only documents. Includes unsafe totals where abstention is correct."""
from pathlib import Path
import json, sys
from PIL import Image, ImageDraw, ImageFont
out=Path(sys.argv[1]); out.mkdir(parents=True,exist_ok=True)
cases=[
 ('supplier','Grand Total:\nINR 1,23,456.78',123456.78),
 ('retail','Grand Total 1,23.45',None),
 ('credit','Grand Total 150.00\nAmount Payable 160.00',None),
 ('gst','Taxable value 100.00\nCGST 9% 9.00\nSGST 9% 9.00\nGrand Total 198.00',None),
 ('vendor','कुल देय राशि 250.00',250),
 ('service','Total Amount: INR 1,250.00',1250),
 ('return','Grand Total -150.00',None),
 ('stock','Total Qty 7\nBalance due 450.00',None),
 ('digital','Grand Total 250.00\nChange 10.00',250),
 ('transcription','Total Amount 120.00 9120.00',None),
 ('split','Grand Total\nPayment: cash\n900.00',None),
 ('gstbill','Invoice Total INR 10,000.00',10000)]
for i,(name,body,expected) in enumerate(cases):
    im=Image.new('RGB',(900,500),'white');d=ImageDraw.Draw(im)
    for j,line in enumerate(('Delhi '+name+' records\nInvoice No: DL-'+str(310+i)+'\nDate: 2026-01-18\n'+body).splitlines()):
        font='/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf' if 'कुल' in line else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
        d.text((30,20+54*j),line,font=ImageFont.truetype(font,31),fill='black')
    im.save(out/(name+'.png'));(out/(name+'.json')).write_text(json.dumps(dict(total=expected,lang='hi' if name=='vendor' else 'en')))

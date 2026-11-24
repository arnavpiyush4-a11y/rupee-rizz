"""Download one attributed CC BY 4.0 CORD v2 test receipt outside the app."""
import json,sys,urllib.request
from pathlib import Path
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
url='https://datasets-server.huggingface.co/rows?dataset=naver-clova-ix%2Fcord-v2&config=default&split=test&offset=0&length=1'
with urllib.request.urlopen(url,timeout=30) as response: row=json.load(response)['rows'][0]['row']
with urllib.request.urlopen(row['image']['src'],timeout=30) as response: (out/'cord-test-0.png').write_bytes(response.read())
(out/'attribution.json').write_text(json.dumps({'author':'NAVER CLOVA','dataset':'CORD v2','source':'https://huggingface.co/datasets/naver-clova-ix/cord-v2','license':'CC BY 4.0','row':'test/0','ground_truth':json.loads(row['ground_truth'])['gt_parse']},indent=2))

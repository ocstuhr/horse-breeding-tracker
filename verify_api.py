import json
import urllib.request

req = urllib.request.Request(
    'http://localhost:3000/api/register',
    data=json.dumps({'username': 'demo', 'password': 'demo123'}).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST',
)

with urllib.request.urlopen(req) as response:
    print(response.status)
    print(response.read().decode())

import socket

s = socket.create_connection(('127.0.0.1', 3000), timeout=2)
s.sendall(b'POST /api/register HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 35\r\n\r\n{"username":"x","password":"y"}')
data = b''
while True:
    chunk = s.recv(4096)
    if not chunk:
        break
    data += chunk
    if b'\r\n\r\n' in data:
        break
print(data[:500])
print('---')
print(data.decode('latin1', 'replace'))

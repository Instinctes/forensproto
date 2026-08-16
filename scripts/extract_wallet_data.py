#!/usr/bin/env python3
import sys
import json
import binascii
import hashlib

# Standard Bitcoin Base58 Alphabet
B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

def b58encode(b: bytes) -> str:
    """Native Base58 encoding ohne externe Module."""
    n = int.from_bytes(b, 'big')
    zero_pfx = 0
    for v in b:
        if v == 0: zero_pfx += 1
        else: break
    res = []
    while n > 0:
        n, mod = divmod(n, 58)
        res.append(B58_ALPHABET[mod])
    return (B58_ALPHABET[0] * zero_pfx) + ''.join(reversed(res))

def double_sha256(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def pubkey_to_address(pubkey: bytes) -> str:
    """Mizogg's Logik: PubKey -> SHA256 -> RIPEMD160 -> +Prefix -> Base58 Checksum"""
    sha256_pubkey = hashlib.sha256(pubkey).digest()
    
    ripemd160 = hashlib.new('ripemd160')
    ripemd160.update(sha256_pubkey)
    hash160 = ripemd160.digest()
    
    # 0x00 is mainnet prefix
    prefixed_hash = b'\x00' + hash160
    
    # Checksum is first 4 bytes of double SHA256
    checksum = double_sha256(prefixed_hash)[:4]
    
    # Adress = Base58(prefixed_hash + checksum)
    return b58encode(prefixed_hash + checksum)

import re

def extract_hints(data: bytes) -> list:
    """Extrahiert alle potenziell nützlichen ASCII-Strings, die als Metadaten/Labels dienen."""
    # Finde alle Strings mit mindestens 4 fortlaufenden druckbaren Zeichen
    matches = re.findall(b'[ -~]{4,}', data)
    hints = []
    
    noise_keywords = {
        'mkey', 'ckey', 'keymeta', 'pool', 'purpose', 'name', 'bestblock', 
        'version', 'minversion', 'cscript', 'destdata', 'hdchain', 'watchs', 
        'account', 'tx', 'ORDER'
    }
    
    # Base58 Alphabet zur Prüfung auf kryptografische Hashes/Adressen
    b58_chars = set('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz')
    
    for b in matches:
        try:
            s = b.decode('ascii').strip()
            if len(s) < 4:
                continue
            
            # 1. Filtern nach bekannten System-Tags oder Rauschen
            if s in noise_keywords:
                continue
                
            # Filtert Standard-Bitcoin-Base58-Prefixe (wie oft in db logs)
            if s.startswith('key') and len(s) == 3:
                continue
                
            # Filtert BDB Address Keys (z.B. name"1Gh8tf... oder receive"1Kg49Q...)
            if (s.startswith('name"') or s.startswith('purpose"') or s.startswith('receive"')) and len(s) > 20:
                continue
                
            # Filtert Hex-Dumps (z.B. Pubkeys oder Script-Hashes 64/66 chars)
            if len(s) >= 40 and all(c in '0123456789abcdefABCDEF' for c in s):
                continue
                
            # Filtert rohe Base58 Strings (oft P2PKH Adressen oder WIF Keys mit 33, 34, 42, 51, 52 Zeichen)
            if len(s) in (33, 34, 42, 51, 52) and all(c in b58_chars for c in s):
                continue
                
            # 2. Vermeiden von Duplikaten
            if s not in hints:
                hints.append(s)
        except Exception:
            pass
            
    return hints

def analyze_wallet(filepath: str):
    try:
        with open(filepath, 'rb') as f:
            data = f.read()
            
        mkey_offset = data.find(b'mkey')
        is_encrypted = (mkey_offset != -1)
        
        mkey_encrypted_hex = ""
        if is_encrypted:
            mkey_data = data[mkey_offset - 72:mkey_offset - 72 + 48]
            mkey_encrypted_hex = binascii.hexlify(mkey_data).decode()
            
        offset = 0
        ckeys_found = []
        
        while True:
            # ckey block identifier
            ckey_offset = data.find(b'ckey', offset)
            if ckey_offset == -1:
                break
                
            # Extract exactly as described
            # data block for ckey is approx 123 bytes from the pre-header
            ckey_data = data[ckey_offset - 52:ckey_offset - 52 + 123]
            
            if len(ckey_data) >= 123:
                ckey_encrypted = ckey_data[:48]
                public_key_length = ckey_data[56]
                public_key = ckey_data[57:57 + public_key_length]
                
                # Check valid P2PKH/SECP256k1 pubkeys lengths (33 compressed or 65 uncompressed)
                if public_key_length in (33, 65):
                    pub_address = pubkey_to_address(public_key)
                    ckeys_found.append({
                        "address": pub_address,
                        "public_key": binascii.hexlify(public_key).decode(),
                        "encrypted_private_key": binascii.hexlify(ckey_encrypted).decode()
                    })
            
            offset = ckey_offset + 4

        # Metadaten Strings Extrahieren
        metadata_hints = extract_hints(data)

        # Compile final forensics report
        return {
            "success": True,
            "isEncrypted": is_encrypted,
            "masterKeyEncryptedHex": mkey_encrypted_hex,
            "addressCount": len(ckeys_found),
            "addresses": ckeys_found,
            "hints": metadata_hints
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Bitte Wallet-Pfad angeben!"}))
        sys.exit(1)
        
    wallet_path = sys.argv[1]
    result = analyze_wallet(wallet_path)
    
    # Return structured JSON to Node.js backend
    print(json.dumps(result))

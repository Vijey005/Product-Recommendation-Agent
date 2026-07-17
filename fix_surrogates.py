# -*- coding: utf-8 -*-
"""Fix all surrogate-pair escape sequences in agent/nodes.py."""

replacements = {
    r'\ud83d\udce1': '\U0001f4e1',  # 📡
    r'\ud83d\udd0d': '\U0001f50d',  # 🔍
    r'\ud83d\udd0e': '\U0001f50e',  # 🔎
    r'\ud83d\udd04': '\U0001f504',  # 🔄
    r'\ud83e\udde0': '\U0001f9e0',  # 🧠
    r'\ud83d\udcf1': '\U0001f4f1',  # 📱
    r'\ud83d\udce6': '\U0001f4e6',  # 📦
    r'\ud83d\udcca': '\U0001f4ca',  # 📊
    r'\ud83d\udcdd': '\U0001f4dd',  # 📝
    r'\ud83d\ude80': '\U0001f680',  # 🚀
    r'\ud83d\udc41': '\U0001f441',  # 👁
    r'\ud83d\udc4d': '\U0001f44d',  # 👍
    r'\ud83d\udc4e': '\U0001f44e',  # 👎
    r'\ud83d\udca1': '\U0001f4a1',  # 💡
    r'\ud83d\udd25': '\U0001f525',  # 🔥
    r'\ud83d\udee1': '\U0001f6e1',  # 🛡
    r'\ud83d\udcb0': '\U0001f4b0',  # 💰
    r'\ud83c\udfc6': '\U0001f3c6',  # 🏆
    r'\ud83d\udd2e': '\U0001f52e',  # 🔮
    r'\ud83d\udcac': '\U0001f4ac',  # 💬
    r'\ud83d\udee0': '\U0001f6e0',  # 🛠
    r'\ud83d\udc4b': '\U0001f44b',  # 👋
    r'\ud83d\udce2': '\U0001f4e2',  # 📢
    r'\ud83d\udcaf': '\U0001f4af',  # 💯
    r'\ud83d\udccc': '\U0001f4cc',  # 📌
    r'\ud83d\udcbe': '\U0001f4be',  # 💾
    r'\ud83d\udcc8': '\U0001f4c8',  # 📈
    r'\ud83d\udcc9': '\U0001f4c9',  # 📉
    r'\ud83d\udce4': '\U0001f4e4',  # 📤
    r'\ud83d\udce5': '\U0001f4e5',  # 📥
    r'\ud83e\udd14': '\U0001f914',  # 🤔
    r'\ud83e\udd2b': '\U0001f92b',  # 🤫
    r'\ud83e\uddb8': '\U0001f9b8',  # 🦸
    r'\ud83e\udd16': '\U0001f916',  # 🤖
    r'\ud83c\udf1f': '\U0001f31f',  # 🌟
    r'\ud83c\udf10': '\U0001f310',  # 🌐
    r'\ud83c\udf89': '\U0001f389',  # 🎉
    r'\ud83c\udfae': '\U0001f3ae',  # 🎮
    r'\ud83d\udda5': '\U0001f5a5',  # 🖥
    r'\ud83d\udcbb': '\U0001f4bb',  # 💻
    r'\ud83d\udd‌‌19': '\U0001f519',  # 🔙
    r'\ud83d\udcd6': '\U0001f4d6',  # 📖
    r'\ud83d\udc68': '\U0001f468',  # 👨
    r'\ud83d\udc69': '\U0001f469',  # 👩
    r'\ud83e\uddd1': '\U0001f9d1',  # 🧑
    r'\ud83e\udd1d': '\U0001f91d',  # 🤝
    r'\ud83d\udc4f': '\U0001f44f',  # 👏
    r'\ud83e\udde9': '\U0001f9e9',  # 🧩
    r'\ud83d\udd2c': '\U0001f52c',  # 🔬
    r'\ud83d\udd2d': '\U0001f52d',  # 🔭
    r'\ud83d\udc8e': '\U0001f48e',  # 💎
}

with open('agent/nodes.py', 'r', encoding='utf-8') as f:
    src = f.read()

total = 0
for seq, replacement in replacements.items():
    n = src.count(seq)
    if n:
        src = src.replace(seq, replacement)
        total += n

with open('agent/nodes.py', 'w', encoding='utf-8') as f:
    f.write(src)

print(f"Fixed {total} surrogate-pair escape(s) in agent/nodes.py")

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!--                  PROFESSIONAL AQDAS MD — README                     -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<div align="center">
  <!-- Main Bot Image with Glowing Effect -->
  <a href="https://teamhussain59-collab.github.io/AQDAS-MD/">
    <img src="https://iili.io/nmjB5y7.jpg" alt="PROFESSIONAL AQDAS MD" width="400" style="border-radius: 20px; box-shadow: 0px 15px 35px rgba(0, 255, 0, 0.5);">
  </a>
  
  <br><br>

  <!-- Animated Typing SVG -->
  <a href="https://git.io/typing-svg">
    <img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&weight=900&size=40&pause=1000&color=00FF00&center=true&vCenter=true&width=800&lines=⚡+PROFESSIONAL+AQDAS+MD+⚡;Official+Hacker+by+AQDAS+MD;Ultimate+WhatsApp+Multi-Device+Bot;Fast+%26+Powerful+Experience+🚀" alt="Typing SVG" />
  </a>
</div>

<br>

<!-- ================= ACTION BUTTONS ================= -->
<div align="center">
  <a href="https://teamhussain59-collab.github.io/AQDAS-MD/" target="_blank">
    <img src="https://img.shields.io/badge/📱_GET_PAIRING_CODE-CLICK_HERE-brightgreen?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Pairing Code" height="45">
  </a>
  &nbsp;&nbsp;
  <a href="https://whatsapp.com/channel/0029Vb9FRVV8F2pDezlyrD0q" target="_blank">
    <img src="https://img.shields.io/badge/💬_WHATSAPP_CHANNEL-JOIN_NOW-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp Channel" height="45">
  </a>
  &nbsp;&nbsp;
  <a href="https://youtube.com/@techfreehussain77?si=YttCmwaUAmbCvFhZ" target="_blank">
    <img src="https://img.shields.io/badge/▶️_YOUTUBE-SUBSCRIBE-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube" height="45">
  </a>
</div>

<br>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=00FF00&height=100&section=header&text=PROFESSIONAL%20AQDAS%20MD&fontSize=40&fontAlignY=40&animation=fadeIn" width="100%" />
</p>

<!-- ================= ABOUT SECTION ================= -->
<h2 align="center">🤖 About Professional AQDAS MD</h2>

**Professional AQDAS MD** is a highly advanced, lightning-fast, and feature-rich WhatsApp Multi-Device Bot built on the **Baileys** library. Created by **AQDAS HACKER**, this bot is designed to provide an ultimate automation experience. From managing groups and downloading media to sophisticated OTP channel automation and AI integration, AQDAS MD does it all smoothly without any lag. It is built for speed, reliability, and professional use.

<br>

<!-- ================= FEATURES SECTION ================= -->
<h2 align="center">✨ Premium Features of AQDAS MD</h2>

<div align="center">

| **Category** | **Features** |
| :--- | :--- |
| 🤖 **AI & Smart Tools** | Advanced AI Chat (OpenRouter), Auto-React, Auto-Status View, Auto-Read, Anti-Delete. |
| 📥 **Downloaders** | Fast YouTube, TikTok, Instagram, Facebook Video/MP3 Downloaders. |
| 🛠️ **Utilities** | Sticker Maker, Weather, Lyrics, Wikipedia, Dictionary, Short URL, QR Code. |
| 👥 **Group Management** | Powerful Admin tools (Kick, Promote, Demote), Anti-Link, Welcome/Goodbye, TagAll. |
| 📡 **OTP Automation** | Read OTPs from SMS APIs (SMSPro, RezSMS) and auto-forward to WhatsApp Channels! |
| 🛡️ **Security** | Spam Protection, Anti-Delete, Anti-ViewOnce. |
| ⚙️ **Customization** | Animated Menu, Custom Prefix, Auto-Online, Always Typing. |

</div>

<br>

<!-- ================= DEPLOYMENT GUIDES ================= -->
<h2 align="center">🚀 Deployment Guides</h2>

<details>
  <summary><b>📱 1. Deploy on Termux (Android)</b></summary>
  <br>
  
  Open Termux and paste the following commands one by one:

  ```bash
  pkg update -y && pkg upgrade -y
  pkg install -y nodejs git ffmpeg python
  pip install yt-dlp
  
  # Zip ko phone mein unzip karo (ya GitHub se clone), phir:
  cd AQDAS-MD
  cp .env.example .env
  
  # .env file edit karein (nano .env)
  # OWNER_NUMBER mein apna number (92300...), WEB=false likho
  # Save: CTRL+X, Y, Enter
  
  npm install
  node index.js

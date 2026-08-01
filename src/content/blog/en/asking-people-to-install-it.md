---
title: My site was asking people to install it
description: A friend's browser offered to install this site and he asked me what it would install. I did not know, which is a bad answer to have about your own site.
date: 2026-08-01
locale: en
slug: asking-people-to-install-it
project: portfolio
aiGenerated: false
hasAudio: false
tags: ['frontend']
---

A friend was on this site and his browser offered to install it. He asked me what it would install. I did not know. That is a bad answer to have about your own site.

What he had found was a PWA install. The site shipped a small file called a manifest, which is what tells a browser that a site can be run like an app.

I put it there myself, and I remember why. I was testing a display mode called standalone, where the site opens in its own window with the browser's own furniture stripped away. No address bar, no tabs, just the page. It gives the graphics more room and it looks good. What I did not think about is that the same file makes the browser show an install button to everyone who visits.

Here is the part worth writing down. The site never asked anyone anything. There is no code in it that offers an install. The browser does that by itself, the moment a page links a manifest. So I had been making a request of every visitor without ever having written the request, and I only found out because someone asked me about it.

The thing on offer was not worth asking for either. Installing gave you a window without an address bar and an icon in your launcher. It did not give you the site offline, because that needs a service worker and this site has never had one. Install it, lose your connection, and you get the same dinosaur as everyone else.

So it is gone. I would rather have the address bar back on my own pages than ask a stranger to install a portfolio.

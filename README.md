<!-- markdownlint-disable MD041 -->

# Email signature manager

This is a simple project for hosting signatures that I use and includes a number of utility scripts for installing them
on various clients. Please feel free to fork this and use for your own purposes, remembering to update the instructions
below for your own purposes.

<!-- prettier-ignore-start -->
<!-- omit from toc -->
## Contents

- [Email signature manager](#email-signature-manager)
  - [Quick start](#quick-start)
    - [Encryption](#encryption)
      - [Encryption with GitHub Actions](#encryption-with-github-actions)
    - [Supported clients](#supported-clients)
      - [Apple Mail (macOS)](#apple-mail-macos)
      - [Microsoft Outlook (macOS)](#microsoft-outlook-macos)
    - [HTML signatures](#html-signatures)
      - [Relative links](#relative-links)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Dependencies](#dependencies)
    - [Cloudflare or other WAF users](#cloudflare-or-other-waf-users)
  - [License](#license)

---
<!-- prettier-ignore-end -->

## Quick start

Currently, these clients are supported for installation, but HTML files can be generated for any client that supports
them:

- Apple Mail (macOS)
- Microsoft Outlook (macOS)
<!-- - Microsoft Outlook (Windows - _not heavily tested_) -->

A helper script is available to install these signatures without having to download the repository.

### Encryption

This script supports AES256 encryption for personally identifiable information. Any text may be enciphered within a
signature HTML file by wrapping it with a `{e{...}e}` encipher indicator. For example:

```Markdown
<span id="not-enciphered">This field is not enciphered</span><br/>
<span id="enciphered">{e{SOMEBASE63STRING=}e}</span>
```

A helper target is available in the [`Makefile`](Makefile) to encipher strings for this purpose:

```sh
make encipher
```

#### Encryption with GitHub Actions

In order to use encryption with the provided GitHub Pages workflow, create an Environment or Repository Secret for the
Repository under the name `CIPHER_PASSWORD` with your cipher password. This will autoamtically be passed to the build
script.

### Supported clients

The following clients are supported for installation. You may be asked for a cipher password if you are running the
script locally. If the signatures contain no encryption, you will still be asked, but can press `Enter` to continue.

#### Apple Mail (macOS)

```sh
curl https://signatures.andrewvaughan.io/installers/remote-install.sh | bash -s -- apple-mail
```

#### Microsoft Outlook (macOS)

```sh
curl https://signatures.andrewvaughan.io/installers/macos.sh | bash -s -- outlook
```

<!-- #### Microsoft Outlook (Windows)

_Via **PowerShell**_:

```PowerShell
& ([scriptblock]::Create(
  (New-Object System.Net.WebClient).DownloadString('https://signatures.andrewvaughan.io/installers/windows.ps1')
)) '-Outlook'
``` -->

### HTML signatures

Signatures are also available via the `make build` script when provided the appropriate cipher password.

A GitHub Pages workflow is also used for remote signature management, as well as image hosting.

#### Relative links

Relative links are supported. They will be modified to the appropriate, absolute URL upon generation.

---

## Installation

Helper methods are provided in the [`Makefile`](Makefile) for installation with the downloaded Repository, all of which
are self-explanatory:

```bash
make outlook
make apple-mail
```

<!-- On Windows, the install script is called via **PowerShell**, similar to the remote call:

```PowerShell
.\src\installers\windows.ps1 -Outlook
``` -->

---

## Usage

Add signature HTML files to the [`src/signatures`](src/signatures) directory for each signature you wish to have
installed, and they will be automatically installed using the methods in the preceding sections. These files should
follow email HTML [best practices][best-practices].

The name of the signature is the filename, sans `.html` extension, with underscores (`_`) converted to spaces.

After you have added or updated your signatures, run the `make` command to build the `dist` directory. This is
automatically done for you with GitHub actions for the GitHub Pages site, so this directory should not be committed.

### Dependencies

The build logic for this project uses Node.js to function, as well as a handful of NPM dependencies. Run `npm install`
prior to running any build or installation scripts.

### Cloudflare or other WAF users

If you host your Pages via a domain name that is hosted by Cloudflare or another provider that provides
scrape-prevention services, you may need to create a rule to allow this script to function properly. Whitelist the
script's user-agent, `Email Signature Generator/1.0`, to do so without over-exposing yourself.

For example, you may choose to use a similar Cloudflare rule to:

```text
(http.user_agent contains "Email Signature Installer" and http.host eq "signatures.andrewvaughan.io")
```

---

## License

This project is released under the MIT license. The [LICENSE](LICENSE) file contains the full text of this project's
License. Images for social media and similar elements are licensed from their respective owners.

```text
MIT License

Copyright (c) 2023 Andrew Vaughan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

All images and media provided by this repository, other than the code, as-licensed, is available under a separate
license:

```text
Copyright (c) 2023 Andrew Vaughan
All Rights Reserved.
```

<!-- Link repository -->

[best-practices]: https://www.smashingmagazine.com/2021/04/complete-guide-html-email-templates-tools/

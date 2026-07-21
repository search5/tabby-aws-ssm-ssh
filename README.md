# tabby-aws-ssm-ssh

A [Tabby](https://tabby.sh) terminal plugin that connects to EC2 instances through **AWS Systems Manager (SSM) Session Manager** — no public IP, no open inbound ports, and optionally no SSH key pair at all.

## Features

- **Two connection modes**
  - **AWS SSM Session** — opens a shell directly through the SSM Agent using only IAM permissions. No SSH key pair or `sshd` required on the instance.
  - **SSH over SSM** — tunnels port 22 through SSM (`AWS-StartSSHSession`) and authenticates with a real SSH key pair, just like a normal SSH connection, but without the instance ever needing a public IP or an open security group inbound rule.
- **Flexible AWS credentials** — use a named AWS CLI profile (`~/.aws/config` / `~/.aws/credentials`, including `credential_process`-based profiles), a static access key/secret, or credentials pulled from a KeePass entry.
- **Flexible SSH credentials** (SSH-over-SSM mode) — a private key file path, a key stored in Tabby's Vault, or a key attached to a KeePass entry.
- **KeePass integration** — works with [tabby-ssh-keepass](https://github.com/search5/tabby-ssh-keepass) to look up AWS credentials and/or SSH private keys from a KeePass database, matched by instance ID.

## Requirements

- Tabby (desktop app)
- The target EC2 instance must have the **SSM Agent** running and registered with Systems Manager (true by default on modern Amazon Linux / Ubuntu / Windows AMIs), and an **IAM instance profile** attached with a policy that grants at least `AmazonSSMManagedInstanceCore`.
- If the instance has no public IP and no NAT gateway, the VPC needs interface endpoints for `com.amazonaws.<region>.ssm`, `ssmmessages`, and `ec2messages` so the SSM Agent can reach Systems Manager.
- The IAM principal used by the plugin needs `ssm:StartSession` (and, for SSH-over-SSM, permission to start the `AWS-StartSSHSession` document) on the target instance.
- For **SSH over SSM**, the instance also needs `sshd` running and the corresponding public key in `~/.ssh/authorized_keys` for the login user.
- For KeePass-backed credentials, the [tabby-ssh-keepass](https://github.com/search5/tabby-ssh-keepass) plugin must be installed and configured.

## Installation

### Option A — Tabby Plugin Manager (recommended)

Search for `aws-ssm-ssh` in **Tabby Settings → Plugins** and click Install. Restart Tabby when prompted.

### Option B — From source

```bash
git clone https://github.com/search5/tabby-aws-ssm-ssh.git
cd tabby-aws-ssm-ssh
npm install
npm run build
npm run install-plugin
```

`npm run install-plugin` copies the built plugin into Tabby's plugin directory:

| OS | Plugin directory |
|---|---|
| Linux | `~/.config/tabby/plugins` |
| macOS | `~/Library/Application Support/tabby/plugins` |
| Windows | `%APPDATA%\tabby\plugins` |

Restart Tabby afterwards to load it.

## Configuration

Create a new connection, choose type **AWS SSM SSH**, and fill in:

| Field | Description |
|---|---|
| AWS Region | Region the instance lives in, e.g. `ap-northeast-2` |
| Instance ID | `i-xxxxxxxxxxxxxxxxx` |
| Connection Type | `AWS SSM Session` (no key needed) or `SSH over SSM` (key pair required) |
| Username | Login user for SSH-over-SSM mode, e.g. `ec2-user` |
| AWS Connection Auth | `Use AWS Profile`, `Static Access Key / Secret`, or `Retrieve from KeePass` |
| SSH Auth Method *(SSH-over-SSM only)* | `Manual Input / Private Key Path` (or Vault) or `Retrieve from KeePass` |

### KeePass lookup

When using the KeePass options, the plugin looks up an entry whose **URL** field is `ssh://<instanceId>` (or falls back to an entry whose **Title** matches the instance ID, if the URL field is empty). AWS access key/secret are read from custom fields (`AWS Access ID` / `AWS Secret Key`), and the SSH private key is read from a file attached to the entry.

## Development

```bash
npm run watch          # rebuild on change
npm run install-plugin # copy dist/ into Tabby's plugin directory
```

## License

MIT

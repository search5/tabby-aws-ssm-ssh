# tabby-aws-ssm-ssh

🌐 [English](README.md) | **한국어**

📖 **[문서](https://search5.github.io/tabby-aws-ssm-ssh/ko/)** (English / 한국어)

[Tabby](https://tabby.sh) 터미널 플러그인으로, **AWS Systems Manager (SSM) Session Manager**를 통해 EC2 인스턴스에 연결합니다 — 퍼블릭 IP도, 인바운드 포트 개방도 필요 없고, 원한다면 SSH 키 페어조차 없어도 됩니다.

## 기능

- **두 가지 연결 모드**
  - **AWS SSM Session** — IAM 권한만으로 SSM 에이전트를 통해 직접 셸을 엽니다. 인스턴스에 SSH 키 페어나 `sshd`가 필요 없습니다.
  - **SSH over SSM** — SSM(`AWS-StartSSHSession`)으로 22번 포트를 터널링하고 실제 SSH 키 페어로 인증합니다. 일반 SSH 연결과 동일하지만, 인스턴스에 퍼블릭 IP나 보안 그룹 인바운드 규칙 개방이 전혀 필요 없습니다.
- **유연한 AWS 자격 증명** — 이름 있는 AWS CLI 프로필(`~/.aws/config` / `~/.aws/credentials`, `credential_process` 기반 프로필 포함), 정적 액세스 키/시크릿, 또는 KeePass 엔트리에서 가져온 자격 증명을 사용할 수 있습니다.
- **유연한 SSH 자격 증명** (SSH-over-SSM 모드) — 개인키 파일 경로, Tabby Vault에 저장된 키, 또는 KeePass 엔트리에 첨부된 키를 사용할 수 있습니다.
- **KeePass 연동** — [tabby-ssh-keepass](https://github.com/search5/tabby-ssh-keepass)와 연동해서 인스턴스 ID로 매칭되는 AWS 자격 증명/SSH 개인키를 KeePass 데이터베이스에서 조회합니다.

## 요구 사항

- Tabby (데스크톱 앱)
- 대상 EC2 인스턴스에 **SSM Agent**가 실행 중이고 Systems Manager에 등록되어 있어야 합니다 (최신 Amazon Linux / Ubuntu / Windows AMI는 기본적으로 그렇습니다). 그리고 최소 `AmazonSSMManagedInstanceCore` 정책이 부여된 **IAM 인스턴스 프로필**이 연결되어 있어야 합니다.
- 인스턴스에 퍼블릭 IP와 NAT 게이트웨이가 없다면, SSM Agent가 Systems Manager에 접근할 수 있도록 VPC에 `com.amazonaws.<region>.ssm`, `ssmmessages`, `ec2messages`용 인터페이스 엔드포인트가 필요합니다.
- 플러그인이 사용하는 IAM 주체에는 대상 인스턴스에 대한 `ssm:StartSession` 권한이 필요합니다 (SSH-over-SSM의 경우 `AWS-StartSSHSession` 문서를 시작할 권한도 필요).
- **SSH over SSM**을 사용하려면 인스턴스에 `sshd`가 실행 중이어야 하고, 로그인 사용자의 `~/.ssh/authorized_keys`에 해당 공개키가 등록되어 있어야 합니다.
- KeePass 기반 자격 증명을 쓰려면 [tabby-ssh-keepass](https://github.com/search5/tabby-ssh-keepass) 플러그인이 설치 및 설정되어 있어야 합니다.

## 설치

### 방법 A — Tabby 플러그인 매니저 (권장)

**Tabby Settings → Plugins**에서 `aws-ssm-ssh`를 검색해 Install을 클릭하세요. 안내가 뜨면 Tabby를 재시작합니다.

### 방법 B — 소스에서 직접 설치

```bash
git clone https://github.com/search5/tabby-aws-ssm-ssh.git
cd tabby-aws-ssm-ssh
npm install
npm run build
npm run install-plugin
```

`npm run install-plugin`은 빌드된 플러그인을 Tabby의 플러그인 디렉터리로 복사합니다:

| OS | 플러그인 디렉터리 |
|---|---|
| Linux | `~/.config/tabby/plugins` |
| macOS | `~/Library/Application Support/tabby/plugins` |
| Windows | `%APPDATA%\tabby\plugins` |

설치 후 Tabby를 재시작해야 적용됩니다.

## 설정

새 연결을 만들고 타입으로 **AWS SSM SSH**를 선택한 뒤 다음을 입력합니다:

| 필드 | 설명 |
|---|---|
| AWS Region | 인스턴스가 위치한 리전, 예: `ap-northeast-2` |
| Instance ID | `i-xxxxxxxxxxxxxxxxx` |
| Connection Type | `AWS SSM Session`(키 불필요) 또는 `SSH over SSM`(키 페어 필요) |
| Username | SSH-over-SSM 모드의 로그인 사용자, 예: `ec2-user` |
| AWS Connection Auth | `Use AWS Profile`, `Static Access Key / Secret`, 또는 `Retrieve from KeePass` |
| SSH Auth Method *(SSH-over-SSM 전용)* | `Manual Input / Private Key Path`(또는 Vault) 또는 `Retrieve from KeePass` |

### KeePass 조회

KeePass 옵션을 사용하면, 플러그인은 **URL** 필드가 `ssh://<instanceId>`인 엔트리를 조회합니다 (URL 필드가 비어있으면 **Title**이 인스턴스 ID와 일치하는 엔트리로 대체). AWS 액세스 키/시크릿은 커스텀 필드(`AWS Access ID` / `AWS Secret Key`)에서 읽고, SSH 개인키는 엔트리에 첨부된 파일에서 읽습니다.

## 개발

```bash
npm run watch          # 변경 시 자동 재빌드
npm run install-plugin # dist/를 Tabby 플러그인 디렉터리로 복사
```

## 라이선스

MIT — [LICENSE](LICENSE) 참고.

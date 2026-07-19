# 프롬프트: Tabby용 GCP IAP 및 AWS SSM SSH 프로토콜 연동 플러그인 개발

이 지시서는 Electron/Angular 기반의 터미널 에뮬레이터인 **Tabby**의 플러그인을 개발하기 위한 상세 요구사항 명세서입니다. 이 명세서에 따라 외부 CLI 프로세스 없이 순수 Node.js의 웹소켓 스트림을 활용하여 GCP IAP 및 AWS SSM 터널을 뚫고, 내장 SSH 연결을 바인딩하는 플러그인을 구현해야 합니다.

---

## 1. 프로젝트 개요
* **목표**: 외부 CLI(gcloud, aws-cli, session-manager-plugin) 프로세스를 실행하지 않고, API와 WebSocket을 직접 구현하여 GCP IAP 및 AWS SSM을 경유하는 SSH 접속용 Tabby 플러그인을 개발합니다.
* **주요 기술 스택**: TypeScript, Angular (Tabby 플러그인 표준), Node.js, `ws` (WebSocket), `ssh2` (또는 Tabby 내장 SSH 모듈)
* **핵심 메커니즘**:
  1. AWS/GCP 자격증명을 활용해 터널링용 WebSocket 엔드포인트 및 인증 토큰 획득.
  2. WebSocket 연결 수립 및 이를 Node.js `Duplex Stream`으로 래핑.
  3. `ssh2` 연결 시 `connect({ sock: duplexStream })` 옵션을 사용하여 SSH 패킷을 해당 터널로 송수신.

---

## 2. 세부 요구사항 및 구현 스펙

### A. 프로필 설정 UI (Profile Provider)
* Tabby의 프로필 설정 화면에 새로운 프로필 타입 **"GCP IAP SSH"** 및 **"AWS SSM SSH"**를 추가합니다.
* 각 프로필 입력 폼에서 받아야 할 설정값:
  * **공통**: SSH 접속 사용자명(Username), 개인키(Private Key) 경로 또는 내용
  * **GCP IAP**: GCP 프로젝트 ID, Zone, 인스턴스 이름, 인증 방식(OAuth 사용자 로그인 또는 서비스 계정 키 파일 경로)
  * **AWS SSM**: AWS 리전(Region), 인스턴스 ID, AWS 프로필 이름 또는 Access Key/Secret Key

### B. 스트림 핸들러 (WebSocket to Duplex Stream)
* WebSocket 커넥션을 Node.js의 `stream.Duplex` 클래스로 래핑하는 변환기를 구현합니다.
* **GCP IAP 터널 스트림**:
  * 구글 IAP 웹소켓 주소(`wss://tunnel.cloudproxy.app/...`)로 웹소켓 연결을 생성합니다.
  * 전달받은 OAuth 토큰을 헤더 또는 쿼리 파라미터에 실어 인증합니다.
  * 웹소켓에서 받는 raw 바이너리 데이터를 Duplex 스트림의 `read` 버퍼에 푸시하고, Duplex에 들어오는 쓰기 요청(`write`)을 웹소켓 프레임으로 변송합니다.
* **AWS SSM 터널 스트림**:
  * AWS SDK(`@aws-sdk/client-ssm`)를 사용해 `StartSession` API를 요청합니다.
  * 응답받은 `StreamUrl`로 웹소켓을 연결합니다.
  * AWS SSM 데이터 채널 프로토콜 스펙(바이너리 메시지 헤더, 페이로드 구조)에 맞게 웹소켓 데이터를 패킹 및 언패킹하는 중간 핸들러를 구현합니다.

### C. SSH 세션 연결 및 자원 해제
* 웹소켓 연결이 성공하고 스트림이 준비되면, Tabby 내장 `SSHConn` 혹은 `ssh2` 클라이언트를 실행합니다.
* 이때 `sock` 옵션으로 위에서 준비된 커스텀 `Duplex` 스트림을 주입합니다.
* 사용자가 터미널 탭을 닫거나 연결이 끊어지면 다음 리소스를 깨끗이 정리합니다:
  * SSH 연결 종료
  * 래핑된 Duplex 스트림 `end()` 호출
  * 활성화된 WebSocket 커넥션 `close()` 호출

---

## 3. 코드 구현 뼈대 가이드 (TypeScript)

### 1) Socket Injection 기본 패턴
```typescript
import { Client } from 'ssh2';
import { Duplex } from 'stream';

// 웹소켓을 Duplex 스트림으로 변환하는 기본 클래스 예시
class WebSocketDuplex extends Duplex {
    constructor(private ws: any) {
        super();
        this.ws.binaryType = 'arraybuffer';
        this.ws.on('message', (data: ArrayBuffer) => {
            this.push(Buffer.from(data));
        });
        this.ws.on('close', () => {
            this.push(null);
        });
        this.ws.on('error', (err: any) => {
            this.destroy(err);
        });
    }

    _read() {}

    _write(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) {
        if (this.ws.readyState === 1) { // OPEN
            this.ws.send(chunk);
            callback();
        } else {
            callback(new Error('WebSocket is not open'));
        }
    }
}
```

### 2) Tabby Profile Provider 등록 패턴
```typescript
import { Injectable } from '@angular/core';
import { ProfileProvider, NewProfile } from 'tabby-core';

@Injectable()
export class SSMSSHProfileProvider extends ProfileProvider {
    id = 'ssm-ssh';
    name = 'AWS SSM SSH';

    async getNewProfiles(): Promise<NewProfile[]> {
        return [];
    }

    // UI에서 입력을 처리하기 위한 컴포넌트 매핑 및 프로필 생성 로직 정의
}
```

---

## 4. 예외 처리 및 검증 항목
* **인증 실패**: AWS 자격증명 만료나 GCP 토큰 만료 시 사용자에게 Tabby UI 알림 창을 띄워 명확한 오류 피드백 제공.
* **연결 타임아웃**: 웹소켓 응답이 없거나 네트워크 연결이 끊어졌을 때 재시도 로직 구현 및 세션 자동 정리.
* **멀티 세션 지원**: 동일한 인스턴스에 여러 탭을 열어도 각 탭마다 고유의 웹소켓 세션이 정상 분리되어 동작해야 함.

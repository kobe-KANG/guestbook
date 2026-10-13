// 사이트 환경 설정. 배포 때 Actions(deploy.yml)가 저장소 변수(Settings → Variables)로 이 파일을 다시 만든다.
// 로컬에서는 scripts/serve.mjs가 환경변수 API_URL로 만들어 주거나, 페이지를 ?api=<주소>로 연다.
const SITE_ENV = { apiUrl: '' };

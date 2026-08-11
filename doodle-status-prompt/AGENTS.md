# doodle-status-prompt

상황을 설명받으면, 특정 스타일의 미니멀 흑백 손그림 캐릭터가 그 상황에 놓인 모습을 그리도록 하는 영어 이미지 생성 프롬프트(Nano Banana, Midjourney, DALL-E 등용)를 만들어 준다. 블로그 삽화나 Slack/Notion 상태 아이콘 용도.

## 캐릭터 스타일 사양

- 형태: 원형 머리, 점 두 개로 된 눈, 마이크 붐이 달린 오버이어 헤드셋을 쓴 단순한 캐릭터
- 선: 손으로 그린 듯한 얇고 일정한 굵기의 검은 선, 그림자/채색 없음
- 배경: 순수 흰색, 아무 장식 없음
- 디테일: 감정이나 상태를 나타내는 만화적 기호(땀방울, 하트, 지그재그, 전구, 'X'자 눈, 모션 라인 등)

`assets/`에 이 스타일을 보여주는 목업 라인아트 3장이 있다(`example-coding.svg`, `example-coffee.svg`, `example-money.svg`) — 실제 AI 생성물이 아니라 스타일 확인용 손그림 목업이다.

## 워크플로우

1. 상황을 받는다. 모호하면 강조하고 싶은 포즈·표정·기호가 있는지 되물어 확인한다.
2. 상황을 짧은 영어 동작/상태 구문으로 번역하고, 상황을 강화할 만화적 기호를 1~2개 고른다(커피면 김 모락모락, 아이디어면 전구, 에러면 'ERROR'/버그 아이콘 등).
3. 노트북이 꼭 필요한 상황인지 판단해 아래 두 템플릿 중 하나를 고르고 대괄호 부분을 채운다. 노트북이 필요 없다면 기본값인 "얼굴 고정" 템플릿을 쓴다.
4. 완성된 프롬프트를 그대로 복사해 쓸 수 있는 하나의 블록으로 출력한다. 프롬프트 본문 안에는 별도 설명을 섞지 않는다.

## 템플릿

**노트북 포함** (캐릭터가 노트북 앞에 앉아 있는 상황 — 예: "코딩 중", "업무 중"):

```
A minimalist hand-drawn doodle, simple black and white line art, a character wearing a headset sitting behind a laptop, front view, [situation], clean white background, no shading, thin uniform black lines, expressive comic-style symbols, cute and simple sketch.
```

**노트북 없음, 얼굴 고정** (기본값 — 노트북이 화면에 꼭 필요한 상황이 아니면 이 템플릿을 쓴다):

```
A minimalist black and white hand-drawn doodle sketch, exactly mimicking the style of the provided reference images. The main subject is the specific simple character consisting of a circle head, two small dots for eyes, and over-ear headphones with a small microphone boom. This exact character is currently [situation]. Keep the facial features simple and consistent with the reference character's standard look. No shading, clean white background, sketchy thin black lines.
```

## [situation] 채우는 법

- 포즈/동작을 추상적으로 말하지 말고 구체적으로: "frustrated" 대신 "kneeling on the ground in despair, surrounded by 'ERROR' text and broken bug icons".
- 감정이 필요할 때만 점 눈을 다른 기호로 바꾸되(하트 눈, 'X'자 눈, 화난 사선 눈) 단순하고 만화적인 형태를 유지한다. 그 외에는 점 눈 그대로 둬서 얼굴이 흔들리지 않게 한다.
- 동작에 맞는 모션/감정 기호를 추가한다: 땀방울(노력/스트레스), 김(커피/뜨거운 음료), '$'나 지폐(수입), 전구(아이디어), Zzz(수면), 모션 라인(속도/달리기).

## 예시

입력: "월급 받아서 신난 상황"

출력:
```
A minimalist black and white hand-drawn doodle sketch, exactly mimicking the style of the provided reference images. The main subject is the specific simple character consisting of a circle head, two small dots for eyes, and over-ear headphones with a small microphone boom. This exact character is currently sitting happily on a pile of money bags, with dollar sign '$' icons floating around and a big smile. Keep the facial features simple and consistent with the reference character's standard look. No shading, clean white background, sketchy thin black lines.
```

더 많은 예시(코딩, 커피 산책 포함 3가지, 이미지 첨부)는 [`README.md`](./README.md)를 참고한다.

## 결과가 스타일에서 벗어날 때

결과물이 너무 복잡하면 "minimalism", "simple icon style", "single line drawing style" 같은 강조 단어를 추가하라고 안내한다. 얼굴이 계속 바뀐다면, 텍스트 프롬프트만으로는 정체성을 완벽히 고정할 수 없으니 참조 이미지를 함께 첨부하라고 안내한다.

## 도구별 실행 방법

| 위 표현 | Claude Code에서 |
|---|---|
| "되물어 확인한다" | 사용자에게 짧게 되묻는다 (필요시 선택지 제시 도구 사용) |

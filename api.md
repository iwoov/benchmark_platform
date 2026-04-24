ideaLAB
base_url=https://idealab.alibaba-inc.com
Endpoint:
/api/anthropic/v1/messages
Anthropic协议
Anthropic原生API格式
Anthropic Messages
Anthropic原生消息API


Python
Python

复制
import requests

headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer your-api-key"
}

data = {
    "model": "claude35_haiku",
    "max_tokens": 150,
    "messages": [
        {
            "role": "user",
            "content": "Hello, how are you?"
        }
    ]
}

response = requests.post(
    "https://idealab.alibaba-inc.com/api/anthropic/v1/messages",
    headers=headers,
    json=data
)

print(response.json())

/api/openai/v1/chat/completions
OpenAI Chat协议
代码示例：
OpenAI Chat
OpenAI兼容的聊天完成API


Python
Python

复制
from openai import OpenAI

client = OpenAI(
    api_key="your-api-key",
    base_url="https://idealab.alibaba-inc.com/api/openai/v1"
)

response = client.chat.completions.create(
    model="gpt-5-mini-0807-global",
    messages=[
        {
            "role": "user",
            "content": "Hello, how are you?"
        }
    ],
    max_tokens=150,
    temperature=0.7
)

print(response.choices[0].message.content)

/api/openai/v1/responses
OpenAI Responses 协议
代码示例：
OpenAI Responses
OpenAI 原生 Responses API


Python
Python

复制
from openai import OpenAI

client = OpenAI(
    api_key="your-api-key",
    base_url="https://idealab.alibaba-inc.com/api/openai/v1"
)

response = client.responses.create(
    model="gpt-5-mini-0807-global",
    input=[
        {
            "role": "user",
            "content": "Hello, how are you?"
        }
    ],
    stream=False
)

print(response.output_text)

/api/vertex/v1beta/models/{modelId}:[generateContent|streamGenerateContent]
Vertex AI协议
Google Vertex AI原生API格式，支持所有gemini开头的模型
Vertex AI
Google Vertex AI原生API格式


Python
Python

复制
import requests

headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer your-api-key"
}

data = {
    "contents": [
        {
            "role": "user",
            "parts": [
                {
                    "text": "Hi"
                }
            ]
        }
    ],
    "generationConfig": {
        "responseModalities": ["TEXT"],
        "temperature": 0.7,
        "maxOutputTokens": 150
    }
}

response = requests.post(
    "https://idealab.alibaba-inc.com/api/vertex/v1beta/models/gemini-2.5-pro-06-17:generateContent",
    headers=headers,
    json=data
)

print(response.json())

modelrouter
baseurl=https://routify.alibaba-inc.com
OpenAI Chat Completions
curl --request POST \
  --url https://routify.alibaba-inc.com/protocol/openai/v1/chat/completions \
  --header 'Authorization: Bearer sk-XXXX' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "gpt-5.2-pro-2025-12-11",
    "messages": [
        {
            "role": "user",
            "content": "十个字告诉我你是谁"
        }
    ],
    "stream": false
}'

OpenAI Responses
curl --request POST \
  --url https://routify.alibaba-inc.com/protocol/openai/v1/responses \
  --header 'Authorization: Bearer sk-XXXX' \
  --header 'Content-Type: application/json' \
  --data '{
    "input": [
        {
            "role": "user",
            "content": "你是谁"
        }
    ],
    "stream": false,
    "model": "gpt-5.2-pro-2025-12-11"
}'

Gemini
curl -X POST "https://routify.alibaba-inc.com/protocol/vertex/v1beta/models/gemini-3-pro-preview:generateContent" \
-H "Content-Type: application/json" \
-H "x-goog-api-key: Bearer {{your API Key}}" \
-d '{
    "contents": [
        {
            "role": "USER",
            "parts": [
                {
                    "text": "xxx"
                },
                {
                    "fileData": {
                        "fileUri": "xxx",
                        "mimeType": "image/jpg"
                    }
                }
            ]
        }
    ]
}'

Anthropic/Claude 协议
curl --location 'https://routify.alibaba-inc.com/protocol/anthropic/v1/messages' \
--header 'Authorization: Bearer {{your API Key}}' \
--header 'Content-Type: application/json' \
--data '{
    "max_tokens": 1024,
    "messages": [
        {
            "content": "who are you",
            "role": "user"
        }
    ],
    "model": "xxx",
    "stream":false
}'

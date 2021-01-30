# v2asub
自动更新V2Ray的订阅，并更新config.json  

不提供任何支持，有问题发Issue。  

## 使用
首先，需要用户参照`subs.example.json`的格式，填入你的订阅链接，创建文件`subs.json`。  
v2asub会读取该文件中给出的订阅地址，ping所有的服务器，按照延迟排序，并选取`choice`个服务器进行负载均衡。
 - `preferredProto`: 仅会选取使用该协议的服务器。目前支持`tcp`和`ws`  
  如果使用`ws`，但是WebSocket的路径（`streamSettings`中的`path`）不符合的话，仅会选取所有和第一项订阅中，延迟最低服务器的路径相同的服务器。
 - `subslist`：订阅服务器列表
   - `must-include`：服务器的名字**必须**包含该列表中的**所有**字符串。
   - `must-exclude`：服务器的名字**不可**包含该列表中的**任何**字符串。
   - `choice`：从该订阅中选取的服务器数量
 - `outboundtag`：目标代理规则的tag。该程序仅会修改这个Tag所对应的outbound对象，不会修改其他内容（排版可能会改变）。

## 运行
clone之后执行`node install`，然后`node index.js` 或者 `npm start`。

软件会基于`template.json`，创建`config.json`，可以直接给V2Ray使用。

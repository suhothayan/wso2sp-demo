Stream Processor Oder Management Demo
=====================

Steps

1. [Oder Management Application](#oder-management-application)
2. [Delayed Shipment Notification Application](#delayed-shipment-notification-application)
3. [User Notification Management](#user-notification-management)
4. [Order Analytics](#order-analytics)

## Oder Management Application

### Accept Orders

#### Setup

Siddhi APP
```sql
@App:name("OrderManagement")
@App:description("Managers Accepted Orders")

@Source(type = 'http', receiver.url='http://localhost:8006/orders', basic.auth.enabled='false',
    @map(type='json'))
@sink(type='log') 
define stream AcceptedOrders (id string, amount long, userId string);

```
#### Test

Curl to test 

```
curl -X POST http://localhost:8006/orders -H "content-type: application/json" \
-d '{"event":{"id":"679","amount":1000,"userId":"1234"}}' -k

```

#### Test Output 

Log output 
```
INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : AcceptedOrders : Event{timestamp=1542025271303, data=[679, 1000, 1234], isExpired=false}

```

### Enriching Orders With Shipment Information

#### Prerequisites

Add DB connection settings in deployment.yaml files, In this demo we are using H2 DB.

Add configs under `wso2.datasources: dataSources` for worker, editor, and dashboard.

```
wso2.datasources:
  dataSources:
  - name: DEMO_DB
    description: Sample DB for the demo
    jndiConfig:
      name: jdbc/DEMO_DB
      useJndiReference: true
    definition:
      type: RDBMS
      configuration:
        jdbcUrl: 'jdbc:h2:${sys:carbon.home}/../database/DEMO_DB;AUTO_SERVER=TRUE'
        username: wso2carbon
        password: wso2carbon
        driverClassName: org.h2.Driver
        maxPoolSize: 10
        idleTimeout: 60000
        connectionTestQuery: SELECT 1
        validationTimeout: 30000
        isAutoCommit: false
```
 
#### Setup 

Siddhi App
```sql
@App:name("OrderManagement")
@App:description("Managers Accepted Orders")

@Source(type = 'http', receiver.url='http://localhost:8006/orders', basic.auth.enabled='false',
    @map(type='json'))
define stream AcceptedOrders (id string, amount long, userId string);

@store(type = 'rdbms', datasource = 'DEMO_DB')
@primaryKey('id') 
define table UserInfoTable (id string, userName string, location string, address string, email string);

@sink(type='log') 
define stream AcceptedOrderInfoStream (orderId string, userId string, userName string, location string, address string, email string, amount long);

@info(name='EnrichOdersWithUserInfo') 
from AcceptedOrders as o join UserInfoTable as u 
    on o.userId == u.id 
select o.id as orderId, o.userId, u.userName, u.location, u.address, u.email, o.amount
insert into AcceptedOrderInfoStream;
```

Loading UserInfoTable with sample user information.

Curl to add data
```
curl -X POST http://localhost:7370/stores/query -H "content-type: application/json" -d '{"appName":"OrderManagement","query":"select \"1234\" as id, \"John\" as userName, \"London\" as location, \"23, Oxford Street, London, UK\" as address, \"john@mail.com\" as email insert into UserInfoTable;"}' -k
curl -X POST http://localhost:7370/stores/query -H "content-type: application/json" -d '{"appName":"OrderManagement","query":"select \"1235\" as id, \"Peter\" as userName, \"Paris\" as location, \"11, Rue Cler, Paris, France\" as address, \"peter@mail.com\" as email insert into UserInfoTable;"}' -k
curl -X POST http://localhost:7370/stores/query -H "content-type: application/json" -d '{"appName":"OrderManagement","query":"select \"1236\" as id, \"Mark\" as userName, \"London\" as location, \"283, Park Street, London, UK\" as address, \"mark@mail.com\" as email insert into UserInfoTable;"}' -k
curl -X POST http://localhost:7370/stores/query -H "content-type: application/json" -d '{"appName":"OrderManagement","query":"select \"1237\" as id, \"Adam\" as userName, \"Berin\" as location, \"171, Mittelstraße, Berlin, Germany\" as address, \"adam@mail.com\" as email insert into UserInfoTable;"}' -k
```
#### Test

Curl to validate data in UserInfoTable

```
curl -X POST http://localhost:7370/stores/query -H "content-type: application/json" \
-d '{"appName":"OrderManagement","query":"from UserInfoTable select * ;"}' -k
```
Expected output 
```
{"records":[["1234","John","London","23, Oxford Street, London, UK","john@mail.com"],["1235","Peter","Paris","11, Rue Cler, Paris, France","peter@mail.com"],["1236","Mark","London","283, Park Street, London, UK","mark@mail.com"],["1237","Adam","Berin","171, Mittelstraße, Berlin, Germany","adam@mail.com"]]}
```

Curl to invoke input message 

```
curl -X POST http://localhost:8006/orders -H "content-type: application/json" \
-d '{"event":{"id":"679","amount":1000,"userId":"1234"}}' -k

```

#### Test Output 
Log output 
```
INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : AcceptedOrderInfoStream : Event{timestamp=1542025763274, data=[1689, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000], isExpired=false}
```

### Making Shipment

#### Prerequisites

Service to make the shipment. Using SiddhiApp as a service here, You can also use other HTTP service providers. 

Siddhi App for ShipmentService

```sql
@App:name("ShipmentService")
@App:description("Description of the plan")

@source(type='http-request', source.id='shipment', receiver.url='http://localhost:8080/shipment/', 
    @map(type='json', @attributes(messageId='trp:messageId', orderId='$.event.orderId')))
define stream ShipmentService (messageId string, orderId string);

@sink(type='http-response', source.id='shipment', message.id='{{messageId}}', headers="'content-type:json','content-length:94'", 
    @map(type='json', @payload(""" { "event": { "status":"{{status}}"} } """)))
--@sink(type='log') 
define stream ShipmentResponce (status String, messageId string);

@info(name='ProcessShipment') 
from ShipmentService
select ifThenElse(convert(orderId, 'long')  > 1000, ifThenElse(count() > 5, "success", "delayed"), ifThenElse(math:round(math:rand()) ==0, "delayed", "success" )) as status, messageId
group by orderId
insert into ShipmentResponce;
```

#### Setup
Siddhi APP

```sql
@App:name("OrderManagement")
@App:description("Managers Accepted Orders")

@Source(type = 'http', receiver.url='http://localhost:8006/orders', basic.auth.enabled='false',
    @map(type='json'))
define stream AcceptedOrders (id string, amount long, userId string);

@primaryKey('id') 
@store(type = 'rdbms', datasource = 'DEMO_DB')
define table UserInfoTable (id string, userName string, location string, address string, email string);

define stream AcceptedOrderInfoStream (orderId string, userId string, userName string, location string, address string, email string, amount long);

@sink( type='http-request', publisher.url='http://localhost:8080/shipment/', 
        method='POST', headers="'Content-Type:application/json'", sink.id="shipment",
        @map(type='json'))
define stream ShipmentService (orderId string, userId string, userName string, location string, address string, email string, amount long);

@source(type='http-response', sink.id='shipment',
    @map(type='json',
        @attributes(orderId = 'trp:orderId', userId='trp:userId', userName='trp:userName', location='trp:location', address='trp:address',
                    email='trp:email', amount='trp:amount', status= "$.event.status")))
@sink(type='log') 
define stream ShipmentServiceResponce (orderId string, userId string, userName string, location string, 
                                       address string, email string, amount string, status string);

@info(name='EnrichOdersWithUserInfo') 
from AcceptedOrders as o join UserInfoTable as u 
    on o.userId == u.id 
select o.id as orderId, o.userId, u.userName, u.location, u.address, u.email, o.amount
insert into AcceptedOrderInfoStream;

@info(name='CallShipmentService') 
from AcceptedOrderInfoStream
select orderId, userId, userName, location, address, email, amount
insert into ShipmentService;

```

#### Test

Curl to test 

```
curl -X POST http://localhost:8006/orders -H "content-type: application/json" \
-d '{"event":{"id":"679","amount":1000,"userId":"1234"}}' -k

```

#### Test Output 
Log output 

```
INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : ShipmentServiceResponce : Event{timestamp=1542028715210, data=[1689, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000, delayed], isExpired=false}
```


### Retry Delayed Shipment

#### Setup
Siddhi APP

```sql
@App:name("OrderManagement")
@App:description("Managers Accepted Orders")

@Source(type = 'http', receiver.url='http://localhost:8006/orders', basic.auth.enabled='false',
    @map(type='json'))
define stream AcceptedOrders (id string, amount long, userId string);

@primaryKey('id') 
@store(type = 'rdbms', datasource = 'DEMO_DB')
define table UserInfoTable (id string, userName string, location string, address string, email string);

@sink( type='http-request', publisher.url='http://localhost:8080/shipment/', 
        method='POST', headers="'Content-Type:application/json'", sink.id="shipment",
        @map(type='json'))
define stream ShipmentService (orderId string, userId string, userName string, location string, address string, email string, amount long);

@source(type='http-response', sink.id='shipment',
    @map(type='json',
        @attributes(orderId = 'trp:orderId', userId='trp:userId', userName='trp:userName', location='trp:location', address='trp:address',
                    email='trp:email', amount='trp:amount', status= "$.event.status")))
@sink(type='log') 
define stream ShipmentServiceResponce (orderId string, userId string, userName string, location string, 
                                       address string, email string, amount string, status string);

@sink(type='inMemory' , topic='AcceptedOrderInfo') 
define stream AcceptedOrderInfoStream (orderId string, userId string, userName string, location string, address string, email string, amount long);

@primaryKey('orderId') 
@store(type = 'rdbms', datasource = 'DEMO_DB')
define table ShipmentInfoTable (orderId string, userId string, location string, address string, amount long, status string);

define trigger RetryTrigger at every 10 sec;

@info(name='EnrichOdersWithUserInfo') 
from AcceptedOrders as o join UserInfoTable as u 
    on o.userId == u.id 
select o.id as orderId, o.userId, u.userName, u.location, u.address, u.email, o.amount
insert into AcceptedOrderInfoStream;

@info(name='CallShipmentService') 
from AcceptedOrderInfoStream
select orderId, userId, userName, location, address, email, amount
insert into ShipmentService;

@info(name='AddResponseToTable') 
from ShipmentServiceResponce 
select orderId, userId, location, address, convert(amount, 'long') as amount, status
update or insert into ShipmentInfoTable 
    on orderId == ShipmentInfoTable.orderId; 

@info(name='FetchDelayedOrders') 
from RetryTrigger as t join ShipmentInfoTable as s 
    on s.status == "delayed"
select orderId, userId, location, address, amount
insert into DelayedShipmentStream; 

@info(name='EnrichDelayedOrders') 
from DelayedShipmentStream as o join UserInfoTable as u 
    on o.userId == u.id 
select o.orderId, o.userId, u.userName, u.location, u.address, u.email, o.amount
insert into ShipmentService;
```

#### Test
Curl to test 

```
curl -X POST http://localhost:8006/orders -H "content-type: application/json" \
-d '{"event":{"id":"1679","amount":1000,"userId":"1234"}}' -k

```

#### Test Output 
Log output 

```
[2018-11-12 14:05:30,401]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : ShipmentServiceResponce : Event{timestamp=1542031530401, data=[1679, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000, delayed], isExpired=false}
[2018-11-12 14:05:31,822]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : ShipmentServiceResponce : Event{timestamp=1542031531821, data=[1679, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000, delayed], isExpired=false}
[2018-11-12 14:05:41,824]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : ShipmentServiceResponce : Event{timestamp=1542031541822, data=[1679, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000, delayed], isExpired=false}
[2018-11-12 14:05:51,823]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : ShipmentServiceResponce : Event{timestamp=1542031551821, data=[1679, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000, delayed], isExpired=false}
[2018-11-12 14:06:01,819]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : ShipmentServiceResponce : Event{timestamp=1542031561818, data=[1679, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000, delayed], isExpired=false}
[2018-11-12 14:06:11,822]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : ShipmentServiceResponce : Event{timestamp=1542031571821, data=[1679, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000, success], isExpired=false}
```

### Sending Notifications for Successful Shipment

#### Prerequisites
Add email configuration to the deployment.yaml files, In this demo we are using a gmail account.

Add config for worker, editor, and dashboard.

```
siddhi:
  refs:
    -
      ref:
        name: 'email-sink'
        type: 'email'
        properties:
          port: '465'
          host: 'smtp.gmail.com'
          ssl.enable: 'true'
          auth: 'true'
          ssl.enable: 'true'
          address: 'wso2.stream.processor@gmail.com'
          username: 'wso2.stream.processor'
          password: '<password>'
```

#### Setup
Siddhi APP

```sql
@App:name("OrderManagement")
@App:description("Managers Accepted Orders")

@Source(type = 'http', receiver.url='http://localhost:8006/orders', basic.auth.enabled='false',
    @map(type='json'))
define stream AcceptedOrders (id string, amount long, userId string);

@primaryKey('id') 
@store(type = 'rdbms', datasource = 'DEMO_DB')
define table UserInfoTable (id string, userName string, location string, address string, email string);

@sink(type='inMemory' , topic='AcceptedOrderInfo') 
define stream AcceptedOrderInfoStream (orderId string, userId string, userName string, location string, address string, email string, amount long);

@sink( type='http-request', publisher.url='http://localhost:8080/shipment/', 
        method='POST', headers="'Content-Type:application/json'", sink.id="shipment",
        @map(type='json'))
define stream ShipmentService (orderId string, userId string, userName string, location string, address string, email string, amount long);

@source(type='http-response', sink.id='shipment',
    @map(type='json',
        @attributes(orderId = 'trp:orderId', userId='trp:userId', userName='trp:userName', location='trp:location', address='trp:address',
                    email='trp:email', amount='trp:amount', status= "$.event.status")))
@sink(type='log') 
define stream ShipmentServiceResponce (orderId string, userId string, userName string, location string, 
                                       address string, email string, amount string, status string);

@primaryKey('orderId') 
@store(type = 'rdbms', datasource = 'DEMO_DB')
define table ShipmentInfoTable (orderId string, userId string, location string, address string, amount long, status string);

define trigger RetryTrigger at every 10 sec;

@sink(ref='email-sink', subject='Order {{orderId}} shipped', to='wso2streamprocessor@gmail.com', content.type='text/html',
      @map(type='text', 
        @payload("""
Hi {{userName}},<br/><br/> 
Your order Id {{orderId}} having <b>{{amount}}</b> items has been shipped to <br/><b>{{address}}</b> <br/>
on {{date}}. <br/><br/>
For more information please contact sales. <br/><br/>
Thank you""")))
@sink(type='inMemory' , topic='Notification') 
define stream NotificationStream (orderId string, userName string, location string, amount long, email string, address string, date string);

@info(name='EnrichOdersWithUserInfo') 
from AcceptedOrders as o join UserInfoTable as u 
    on o.userId == u.id 
select o.id as orderId, o.userId, u.userName, u.location, u.address, u.email, o.amount
insert into AcceptedOrderInfoStream;

@info(name='CallShipmentService') 
from AcceptedOrderInfoStream
select orderId, userId, userName, location, address, email, amount
insert into ShipmentService;

@info(name='AddResponseToTable') 
from ShipmentServiceResponce 
select orderId, userId, location, address, convert(amount, 'long') as amount, status
update or insert into ShipmentInfoTable 
    on orderId == ShipmentInfoTable.orderId; 

@info(name='FetchDelayedOrders') 
from RetryTrigger as t join ShipmentInfoTable as s 
    on s.status == "delayed"
select orderId, userId, location, address, amount
insert into DelayedShipmentStream; 

@info(name='EnrichDelayedOrders') 
from DelayedShipmentStream as o join UserInfoTable as u 
    on o.userId == u.id 
select o.orderId, o.userId, u.userName, u.location, u.address, u.email, o.amount
insert into ShipmentService;

@info(name='NotifySuccessResponse') 
from ShipmentServiceResponce[status == "success"]
select orderId, userName, location, convert(amount, 'long') as amount, email, address, time:currentDate() as date
insert into NotificationStream; 
```

#### Test

Note: modify to email to your email to get the output

Curl to test 

```
curl -X POST http://localhost:8006/orders -H "content-type: application/json" \
-d '{"event":{"id":"679","amount":1000,"userId":"1234"}}' -k

```

#### Test Output 
Log output 

```
[2018-11-12 15:48:17,028]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - OrderManagement : ShipmentServiceResponce : Event{timestamp=1542037696161, data=[679, 1234, John, London, 23, Oxford Street, London, UK, john@mail.com, 1000, success], isExpired=false}
```

Email output
```
Hi John,

Your order Id 679 having 1,000 items has been shipped to 
23, Oxford Street, London, UK 
on 2018-11-12. 

For more information please contact sales. 

Thank you
```

## Delayed Shipment Notification Application 

### Identifying Delay 

#### Prerequisites

Expose "AcceptedOrderInfoStream" and "NotificationStream" of OrderManagement app via in-memory topics 

#### Setup

Siddhi APP

```sql
@App:name("DelayedShipmentNotification")
@App:description("Notify delayed shipments")

@source(type='inMemory' , topic='AcceptedOrderInfo') 
define stream AcceptedOrderInfoStream (orderId string, userId string, userName string, location string, address string, email string, amount long);

@source(type='inMemory' , topic='Notification') 
define stream NotificationStream (orderId string, userName string, location string, amount long, email string, address string, date string);

@sink(type='log') 
define stream DelayedShipmentPredictionStream (orderId string, userName string, location string, amount long, email string);

@info(name='DetectDelay') 
from every e1= AcceptedOrderInfoStream -> not NotificationStream [orderId ==e1.orderId ] for 30 sec
select e1.orderId, e1.userName, e1.location, e1.amount, e1.email
insert into DelayedShipmentPredictionStream; 
```

#### Test

Simulate single event to "AcceptedOrderInfoStream".

#### Test Output 

Log output 

```
[2018-11-12 17:21:55,201]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - DelayedShipmentNotification : DelayedShipmentPredictionStream : Event{timestamp=1542043315201, data=[678, John, London, 1000, john@gmail.com], isExpired=false}
```

###Delay Prediction & Online Training 

#### Setup

Siddhi APP

```sql
@App:name("DelayedShipmentNotification")
@App:description("Notify delayed shipments")

@source(type='inMemory' , topic='AcceptedOrderInfo') 
define stream AcceptedOrderInfoStream (orderId string, userId string, userName string, location string, address string, email string, amount long);

@source(type='inMemory' , topic='Notification') 
define stream NotificationStream (orderId string, userName string, location string, amount long, email string, address string, date string);

@sink(type='log') 
define stream DelayedShipmentNotificationStream (orderId string, userName string, location string, amount long, email string, predictedDelay long);

@info(name='DetectDelay') 
from every e1= AcceptedOrderInfoStream -> not NotificationStream [orderId ==e1.orderId ] for 30 sec
select e1.orderId, e1.userName, e1.location, e1.amount, e1.email
insert into DelayedShipmentPredictionStream; 

--Train the ML model

@info(name='GetCurrentTime') 
from AcceptedOrderInfoStream
select currentTimeMillis() as time, orderId, amount
insert into AcceptedOrderInputStream;

@info(name='DelayCalculation') 
from every e1= AcceptedOrderInputStream -> e2= NotificationStream [orderId ==e1.orderId ]
select (currentTimeMillis() - e1.time)/1000 as delay, e1.amount
insert into DelayTrainingStream;

@info(name = 'TrainDelay')
from DelayTrainingStream#streamingml:updateAMRulesRegressor('model1', amount, delay)
select meanSquaredError
insert into TrainingOutputStream;

--Predict using ML model

@info(name = 'PredictDelay')
from DelayedShipmentPredictionStream#streamingml:AMRulesRegressor('model1', amount)
select orderId, userName, location, amount, email, convert(prediction, 'long') as predictedDelay
insert into DelayedShipmentNotificationStream;
```

Feed simulate data train the model using "train.csv" by sending events to "DelayTrainingStream"

#### Test

Simulate single event to "AcceptedOrderInfoStream".

#### Test Output 

Log output 

```
[2018-11-12 17:48:40,702]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - DelayedShipmentNotification : DelayedShipmentNotificationStream : Event{timestamp=1542044920698, data=[678, John, London, 1000, john@gmail.con, 206], isExpired=false}
```

### Sending Notifications for Delayed Shipment

#### Setup

Siddhi APP

```sql
@App:name("DelayedShipmentNotification")
@App:description("Notify delayed shipments")

@source(type='inMemory' , topic='AcceptedOrderInfo') 
define stream AcceptedOrderInfoStream (orderId string, userId string, userName string, location string, address string, email string, amount long);

@source(type='inMemory' , topic='Notification') 
define stream NotificationStream (orderId string, userName string, location string, amount long, email string, address string, date string);

@sink(ref='email-sink', subject='Shipment delayed for order {{orderId}}', to='wso2streamprocessor@gmail.com', content.type='text/html',
      @map(type='text', 
        @payload("""
Hi {{userName}},<br/><br/>
We regret to inform you that your order Id {{orderId}} of <b>{{amount}}</b> items<br/>
has been delayed aproximatly by {{predictedDelay}} secs<br/><br/>
For more information please contact sales.<br/><br/>
Thank you""")))
define stream DelayedShipmentNotificationStream (orderId string, userName string, location string, amount long, email string, predictedDelay long);


@info(name='DetectDelay') 
from every e1= AcceptedOrderInfoStream -> not NotificationStream [orderId ==e1.orderId ] for 30 sec
select e1.orderId, e1.userName, e1.location, e1.amount, e1.email
insert into DelayedShipmentPredictionStream; 

--Train the ML model

@info(name='GetCurrentTime') 
from AcceptedOrderInfoStream
select currentTimeMillis() as time, orderId, amount
insert into AcceptedOrderInputStream;

@info(name='DelayCalculation') 
from every e1= AcceptedOrderInputStream -> e2= NotificationStream [orderId ==e1.orderId ]
select (currentTimeMillis() - e1.time)/1000 as delay, e1.amount
insert into DelayTrainingStream;

@info(name = 'TrainDelay')
from DelayTrainingStream#streamingml:updateAMRulesRegressor('model1', amount, delay)
select meanSquaredError
insert into TrainingOutputStream;

--Predict using ML model

@info(name = 'PredictDelay')
from DelayedShipmentPredictionStream#streamingml:AMRulesRegressor('model1', amount)
select orderId, userName, location, amount, email, convert(prediction, 'long') as predictedDelay
insert into DelayedShipmentNotificationStream;

```

#### Test

Note: modify to email to your email to get the output

Simulate single event to "AcceptedOrderInfoStream".

#### Test Output 

Email output
```
Hi John,

We regret to inform you that your order Id 678 of 1,000 items
has been delayed aproximatly by 230 secs

For more information please contact sales.

Thank you
```

## User Notification Management 

### Custom Shipment Notification 

#### Setup
 
Siddhi App for custom notification
```sql
@App:name("NotificationApp")
@App:description("Notification management for users")

@source(type='inMemory' , topic='Notification') 
define stream NotificationStream (orderId string, userName string, location string, amount long, email string, address string, date string);

@sink(ref='email-sink', subject='Shipment notification for order {{orderId}}', to='wso2streamprocessor@gmail.com', content.type='text/html',
      @map(type='text', 
        @payload("""
Hi,<br/><br/>
Order of <b>{{userName}}</b> with order Id {{orderId}} having <b>{{amount}}</b> items has been shipped to <br/><b>{{location}}</b> on {{date}}.<br/>
For more information please contact sales.<br/><br/>
Thank you""")))
@sink(type='log') 
define stream FilteredEmailStream (orderId string, userName string, location string, amount long, email string, date string);

from NotificationStream[location == '${location}' and amount > ${amount} ] 
select orderId, userName, location, amount, '${email}' as email, date 
insert into FilteredEmailStream ;
```

Add OrderNotificationManagement.json to the dashboard resources

#### Test

Fill the values in the business rules dashboard 
with amount 1000, location London and with your email id.

#### Test Output 
TBA

## Order Analytics

### Order Analysis Overtime

#### Setup

Siddhi APP

```sql
@App:name("OrderAnalytics")
@App:description("Analyse orders Overtime")

@source(type='inMemory' , topic='AcceptedOrderInfo') 
define stream AcceptedOrderInfoStream (orderId string, userId string, userName string, location string, address string, email string, amount long);

@store(type = 'rdbms', datasource = 'DEMO_DB')
define aggregation OrderAggregation
from AcceptedOrderInfoStream
select userId, userName, location, count() as orders, sum(amount) as itemsOrdered
    group by userId, location
    aggregate every sec ... year;
```

#### Test

Simulate some events to "AcceptedOrderInfoStream".

#### Test Output 

Curl to retrieve the data 

```
curl -X POST http://localhost:7370/stores/query -H "content-type: application/json" -d '{"appName":"OrderAnalytics", "query":"from OrderAggregation within \"2018-10-01 00:00:00\", \"2020-12-31 00:00:00\" per \"minutes\" select * ;"}' -k

```

Output
```json
{"records":[[1541945040000,"1234","John","London",1,1000],[1541950740000,"1234","John","London",1,1000],[1541950860000,"1234","John","London",1,1000],[1541954340000,"1234","John","London",1,1000],
[1541954400000,"1234","John","London",2,2000],[1541954520000,"1234","John","London",1,1000],[1542022320000,"1234","John","London",1,1000],[1542022380000,"1234","John","London",1,1000],[1542022800000,"1234","John","London",1,1000]]}
```

### Visualise Order By Location

### Setup

Name : Order By Location
Provider : Siddhi Store Data Provider
Siddhi App: 
```sql
@primaryKey('orderId') 
@store(type = 'rdbms', datasource = 'DEMO_DB')
define table ShipmentInfoTable (orderId string, userId string, location string, address string, amount long, status string);
```

Query Generation Configuration: 
```js
return "from ShipmentInfoTable "+
"select location, sum(amount) as totalOrders "+
"group by location ";  
```

Generate Bar Chart

### Visualise Order Status Percentage

### Setup

Name : Order Status Percentage
Provider : Siddhi Store Data Provider
Siddhi App: 
```sql
@primaryKey('orderId') 
@store(type = 'rdbms', datasource = 'DEMO_DB')
define table ShipmentInfoTable (orderId string, userId string, location string, address string, amount long, status string);
```

Query Generation Configuration: 
```js
return "from ShipmentInfoTable "+
"select status, sum(amount) as totalOrders "+
"group by status ";  
```

Generate Pie Chart

## Visualise Orders Overtime
Add following custom charts and build the dashboard with time picker 
* Orders Overtime  
* Items Ordered Overtime
* Orders By Location Overtime













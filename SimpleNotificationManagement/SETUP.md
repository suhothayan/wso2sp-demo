Simple Notification Management Demo
=====================

## Setup

* Download [WSO2 Stream Processor 4.3.0](https://wso2.com/analytics-and-stream-processing/)
* Download [Kafka](https://kafka.apache.org/downloads) and run on the local machine (kafka_2.11-2.0.1 is used here)
* Create a Kafka topic "shipment-info"
* Download and setup [MySQL](https://dev.mysql.com/downloads/mysql/5.7.html)
* Download and add following jars to the SP_HOME/lib directory.
 
    - Siddhi extensions

        - [siddhi-map-avro-1.0.6.jar](https://mvnrepository.com/artifact/org.wso2.extension.siddhi.map.avro/siddhi-map-avro/1.0.7)
        - [siddhi-io-http-1.0.43.jar](http://central.maven.org/maven2/org/wso2/extension/siddhi/io/http/siddhi-io-http/1.0.43/siddhi-io-http-1.0.43.jar)
        - [siddhi-map-xml-4.0.21.jar](http://central.maven.org/maven2/org/wso2/extension/siddhi/map/xml/siddhi-map-xml/4.0.21/siddhi-map-xml-4.0.21.jar)
        - [siddhi-map-json-4.0.40.jar](http://central.maven.org/maven2/org/wso2/extension/siddhi/map/json/siddhi-map-json/4.0.40/siddhi-map-json-4.0.40.jar)

    - Other dependent jars
    
        - [tapestry-json-5.4.1.wso2v1.jar](http://maven.wso2.org/nexus/content/repositories/releases/org/wso2/orbit/org/apache/tapestry/tapestry-json/5.4.1.wso2v1/tapestry-json-5.4.1.wso2v1.jar)
        - mysql-connector-java-8.0.13.jar : Download from the [MySQL site](https://dev.mysql.com/downloads/connector/j/) 

* Add Kafka dependencies 

    - Get the following jars from the KAFKA_HOME/libs directory

        - kafka_2.11-2.0.1.jar
        - kafka-clients-2.0.1.jar
        - metrics-core-2.2.0.jar
        - scala-library-2.11.12.jar
        - zkclient-0.10.jar
        - zookeeper-3.4.13.jar
        
    - Convert the jars to OSGi bundles by following the steps given [here](https://wso2-extensions.github.io/siddhi-io-kafka/#how-to-use)

    - Add the converted jars to SP_HOME/lib
    
        - kafka_clients_2.0.1_1.0.0.jar
        - metrics_core_2.2.0_1.0.0.jar
        - zookeeper_3.4.13_1.0.0.jar
        - zkclient_0.10_1.0.0.jar
        - kafka_2.11_2.0.1_1.0.0.jar
        - scala_library_2.11.12_1.0.0.jar

* Add DB and Email configuration given [here](deployment.yaml) to deployment.yaml files

## Deployment 

Add following Applications to the editor and **run** the application

* [DeliveryInfoService.siddhi](DeliveryInfoService.siddhi): This works as the mock service sending expected delivery information.

* [NotificationManagement.siddhi](NotificationManagement.siddhi): Contains the main processing logic.

* [KafkaClient.siddhi](KafkaClient.siddhi): The client we will use to send message to Kafka.
      
Loading BuyerInfoTable with sample user information.

Curl to add data
```
curl -X POST http://localhost:7370/stores/query -H "content-type: application/json" \
 -d '{"appName":"NortificationMangement","query":"select \"1234\" as id, \"John\" as name, \"23, Oxford Street, London, UK\" as address, \"your@email.com\" as email insert into BuyerInfoTable;"}' -k
```
Note change `your@email.com` to your email address.

Curl to validate data in BuyerInfoTable

```
curl -X POST http://localhost:7370/stores/query -H "content-type: application/json" \
 -d '{"appName":"NortificationMangement","query":"from BuyerInfoTable select * ;"}' -k
```
Expected output 
```
{"records":[["1234","John","23, Oxford Street, London, UK","your@email.com"]]}
```

#### Test

Simulate the data to `ShipmentInfoStream` of the KafkaClient Application with following information: 

* orderId : 18902
* buyerId : 1234
* shipmentType : DHL

#### Test Output 
Log output 

```
[2018-12-09 17:55:50,085]  INFO {org.wso2.siddhi.core.stream.output.sink.LogSink} - NortificationMangement : DeliveryInfoResponceStream : Event{timestamp=1544358348470, data=[18902, John, 23, Oxford Street, London, UK, your@email.com, DHL, 2018-12-11], isExpired=false}
```

Email output
```
Hi John, 

Your order ID 18902 has been shipped to 
23, Oxford Street, London, UK, 
and it is expected to arrive at your doorstep on 2018-12-11. 

For more information please contact sales. 

Thank you
```













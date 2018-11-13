/*
 *  Copyright (c) 2017, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 *
 */

import React, {Component} from 'react';
import VizG from 'react-vizgrammar';
import Widget from '@wso2-dashboards/widget';
import moment from 'moment';

class ItemsOrderedOvertime extends Widget {
    constructor(props) {
        super(props);
        this.stackedBarChartConfig = {
            x: 'AGG_TIMESTAMP',
            charts: [{type: 'area', y: 'itemsOrdered', fill: '#4659f9'}],
            maxLength: 6,
            width: this.props.glContainer.width,
            height: this.props.glContainer.height,
            animate: true,
            legend: true,
            brush: true,
            xAxisLabel: 'Time',
            yAxisLabel: 'Items Ordered',
            append: false,
            timeStep: 'second',
            tipTimeFormat: '%Y-%m-%d %H:%M:%S',
        };

        this.state = {
            width: props.glContainer.width,
            height: props.glContainer.height,
            isInitialized: false,
            data: null,
        };

        this.metadata = {
            names: ['AGG_TIMESTAMP', 'itemsOrdered'],
            types: ['TIME', 'LINEAR'],
        };

        this.handleResize = this.handleResize.bind(this);
        this.props.glContainer.on('resize', this.handleResize);
        this.handleWidgetData = this.handleWidgetData.bind(this);
        this.handlePublisherParameters = this.handlePublisherParameters.bind(this);
        this.handleGraphUpdate = this.handleGraphUpdate.bind(this);
    }

    /**
     * Unsubscribe from the WidgetChannelManager
     */
    componentWillUnmount() {
        super.getWidgetChannelManager().unsubscribeWidget(this.props.id);
    }

    /**
     * Handle resize when there is a size-change in the browser window.
     */
    handleResize() {
        this.setState({width: this.props.glContainer.width, height: this.props.glContainer.height});
    }

    /**
     * Register the callback function in order to get data from Publisher widgets. This callback method will be
     * triggered once the Publisher widgets send messages.
     */
    componentWillMount() {
        super.subscribe(this.handlePublisherParameters);
    }

    /**
     * This method will initiate graph rendering part by retrieving the provider configuration from widget
     * configuration file.
     */
    componentDidMount() {
        this.handleGraphUpdate();
    }

    /**
     * Handle published messages from the subscribed widgets in the dashboard to extract required parameters
     *
     * @param message JSON object coming from the subscribed widgets
     */
    handlePublisherParameters(message) {
        this.state.isInitialized ? super.getWidgetChannelManager().unsubscribeWidget(this.props.id) : "";
        this.setState({
            timeFromParameter: moment(message.from)
                .format('YYYY-MM-DD HH:mm:ss'),
            timeToParameter: moment(message.to)
                .format('YYYY-MM-DD HH:mm:ss'),
            timeUnitParameter: message.granularity,
        }, this.handleGraphUpdate);
    }


    handleGraphUpdate() {
        /* Retrieve the widget provider configuration using the REST API */
        super.getWidgetConfiguration(this.props.widgetID)
            .then((message) => {
                const dataProviderConf = ItemsOrderedOvertime.getProviderConf(message.data);
                let query = dataProviderConf.configs.config.queryData.query;

                /* Insert required parameters to the query string. */
                dataProviderConf.configs.config.queryData.query = query
                    .replace('{{timeFrom}}', this.state.timeFromParameter)
                    .replace('{{timeTo}}', this.state.timeToParameter)
                    .replace('{{perGranularity}}', this.state.timeUnitParameter);

                /*  This will create a websocket connection with the backend by providing provider configuration,
                    callback function and widget ID. It created a provider in the backend and push data to the frontend
                    using the websocket tunnel. The callback function will be triggered when there is a data from the
                     backend.
                 */
                super.getWidgetChannelManager()
                    .subscribeWidget(
                        this.props.id,
                        this.handleWidgetData,
                        dataProviderConf
                    );
                this.state.isInitialized = true;
            })
            .catch((e) => {
                console.log("ERROR in getting widget provider configuration " + e);
            });
    }

    /**
     * This method will return the provider configuration from the WidgetConfiguration object.
     * @param widgetConfiguration
     * @returns providerConfig
     */
    static getProviderConf(widgetConfiguration) {
        return widgetConfiguration.configs.providerConfig;
    }

    /**
     * This method will be triggered when the data is pushed from the backend.
     * @param data
     */
    handleWidgetData(data) {
        if (data.data.length != 0) {
            this.setState({
                data: data.data
            })
        }
    }

    render() {
        if (this.state.data != null) {
            return (
                <div
                    style={{
                        marginTop: "5px",
                        width: this.props.glContainer.width,
                        height: this.props.glContainer.height,
                    }}
                >
                    <VizG
                        config={this.stackedBarChartConfig}
                        metadata={this.metadata}
                        data={this.state.data}
                        append={false}
                        height={this.props.glContainer.height}
                        width={this.props.glContainer.width}
                    />
                </div>
            );
        } else {
            return <div>No data</div>;
        }
    }
}

global.dashboard.registerWidget("ItemsOrderedOvertime", ItemsOrderedOvertime);

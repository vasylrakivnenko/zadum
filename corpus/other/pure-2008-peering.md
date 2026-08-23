## Software Requirements Specification for Internetworking of Content Delivery Networks through Peering

0.1
2010-03-08

## Introduction

## Purpose

      This document describes the requirements specification (SRS) for the software infrastructure (or
      product) that enables the internetworking of Content Delivery Networks (CDNs) through peering,
      henceforth termed as ‘CDN peering’, and provides an overall description of it. It presents a means for
      distinct CDNs to coordinate and cooperate with other CDNs, by investigating and developing (a)
      models for effective internetworking between CDNs though peering; (b) protocols for service
      delivery in a cooperative environment of CDNs; (c) some concrete examples (technology trends) that
      exhibits the notion of content networking; and (d) policies for autonomic management of service level
      through resource negotiation in an on-demand basis. Thus, this document provides a basis for
      evaluating the proposal for internetworking between CDNs. This is the version 0.1 of the software
      requirements specification.

## Document Conventions and Terminology

      When writing this SRS for CDN peering, the following terminologies are used:

        Web server (WS): The container of content comprising of two layersoverlay, which is a collection of Web service host (e.g. Apache, Tomcat), Service Level Agreement (SLA)- allocator, and policy agent, and core, which refers to the underlying hardware infrastructure.
        Mediator: A policy-driven entity, authoritative for policy negotiation and management.
        Service registry (SR): Discovers and stores resource and policy information in local domain.
        Peering Agent (PA): A resource discovery module in the peering CDNs environment.
        Policy repository (PR): A storage of Web server, mediator and peering policies.
        PWS: A set of Web server-specific rules for content storage and management.
        PM: A set of mediator-specific rules for interaction and negotiation.
        PPeering: A set of rules for creation and growth of the peering arrangement.

## Intended Audience and Reading Suggestions

      This document is written for the researchers, software developers, advanced practitioners,
      documentation writers, and users involved in CDN domain to initiation an open discussion for
      exploring development opportunities regarding the internetworking between CDNs. Section 2
      discusses the steps that are to be undertaken to “bring-up” or “cease” an internetworking arrangement
      between CDNs. In the next section, system features with their functional requirements are presented
      to highlight the major services provided by the intended product. Then the external interface
      requirements highlighting the logical characteristics of each interface between the software product
      and the users are discussed. Finally, this specification is concluded with the reference documents on
      which this document is based on.

## Project Scope

      The final product enabling CDN peering assists in coordinated and cooperative content delivery via
      internetworking among distinct CDNs to allow providers to rapidly “scale-out” to meet both flash
      crowds and anticipated increases in demand, and remove the need for a single CDN to provision
      resources. An ad-hoc or planned peering of CDNs requires fundamental research to be undertaken to
      address the core problems of measuring and disseminating load information, performing request
      assignment and redirection, enabling content replication and determining appropriate compensation
      among participants on a geographically distributed “Internet” scale. In contrast to a single CDN, for
      which these issues are deeply interrelated and co-dependent, the main thrust for the final product
      enabling CDN peering is to consider them in a coordinated and cooperative manner among many
      peered CDNs, whilst satisfying the complex multi-dimensional constraints placed on each individual
      provider. Each provider must ensure that their individual SLAs are met when serving content for its
      own customers to end users, while meeting any obligations it has made when participating in a group
      of many providers.

## References

      This document builds on the following references:

        An introduction to CDN technologies [1].
        The research problem for internetworking of CDNs [2]
        The architecture for CDN peering [3].
        The performance models to demonstrate the effects of peering and to predict user perceived performance [4].
        CDN peering models along with the challenges for implementation [5].

## Overall Description

## Product Perspective

      CDN peering allows different CDN providers to share resources in order to provide larger scale
      and/or reach to each participant than they could not achieve otherwise. It is formed by a set of
      autonomous CDNs, which cooperate through a mechanism that provides facilities and infrastructure
      for cooperation in order to virtualize multiple providers. It is expected that an effective peering
      arrangement between CDNs would require multiple steps to occur.

        Initiation: A CDN’s reach and scale is limited by its ability to handle peak load, cost of equipment, scalable infrastructure, and/or demand for the increased coverage of its infrastructure. Peering allows a particular CDN to achieve larger scale/reach through resource sharing with other CDN(s). It is triggered by an initialization request sent to the mediator under exceptional circumstances, e.g. flash crowds, when the (primary) CDN realizes that it cannot handle a part of the workload on its Web Servers (WSs). The triggering condition must consider the expected and unexpected load increases in the initiating CDN.
        Negotiated relationship: The controlling interest of a CDN to interconnect with other CDNs leads to the creation of a negotiated relationship. In the business domain, this relationship (most likely) would take the form of a legal document which describes the expected level of services from the involving parties such as storage requirements, the required rate of transfer, cost of services; the expected duration of receiving service, penalties for service violations, and other preconditions such as the initiating CDN’s preference to gain resources at a particular region. Negotiated relationships can also be established through means nontechnical terms (financial statement) or technical terms (SLAs). Thus, negotiated relationships must specify the interactions among entities including service administration, coordination and disband (or re-arrangement) of internetworked CDNs. In the CDN peering architecture, the mediator instance obtains the resource and access information from the Service Registry (SR), whilst SLAs and other policies from the Policy Repository (PR). The mediator instance on the primary CDN’s behalf generates its service requirements based on the current circumstance and SLA requirements of its customer(s). Therefore, divergent policies are allowed that specify the information that can be shared during interaction through providing a certain level of visibility to preserve privacy.
        Resource discovery: Once the initiating CDN identifies its roles and activities through the created negotiated relationships for coordination and cooperation between CDNs, the next step is to choose potential CDNs to peer with. The mediator instance passes the service requirements to the local PA to discover external resources from peers. The PA performs the resource discovery process through predicting performance of the peers, working around issues of separate administration and limited information sharing among enlisted CDNs. If there are any preexisting peering arrangements (for a long term scenario) then these will be returned at this point. Otherwise, it carries out short term negotiations with the Peering Agent (PA) identified peering targets.
        CDN peering protocols: The next step is to configure the ‘CDN peering’ protocols at the conduit of the respective CDNs in order to technically support the terms and policies implicitly specified through the negotiated relationships. This step includes advertising the configurations (topology aspects, geographical proximity, capability, performance, etc.) of enlisted CDNs through inter-PA communication. On establishment of a peering arrangement, these protocols also allow participating CDNs to exchange information regarding the content availability and assists to redirect requests to an optimal peer. Request-redirection in a peering arrangement depends on the content distribution and request-routing policies (specified in the CDN peering protocols) associated with the content as well as the specific algorithms and methods used for directing these requests.
        Operational management: When the primary CDN acquires sufficient resources from the peers to meet its SLA with the customer, the new peering arrangement becomes operational. Hence, necessary functional policies are deployed and administered in an effective way. Once a peering arrangement is established, all participating parties cooperate in the execution of common goal(s). Peering also enables the CDNs to exchange accounting information to perform billing based on the negotiated relationships. If no CDN is interested in such peering, peering arrangement creation through re-negotiation is resumed by tuning the negotiated relationships with reconsidered service requirements.
        Disband or re-arrangement: An existing peering arrangement may need to either disband or re-arrange itself (within the scope of the negotiated relationships) if any of the following conditions hold: (a) the circumstances under which the arrangement was formed no longer hold; (b) peering is no longer beneficial for the participating CDNs; (c) an existing peering arrangement needs to be expanded further in order to deal with additional load; or (d) participating CDNs are not meeting their agreed upon contributions.

      Figure 1 presents the interaction flows within the architecture of the CDN peering with an abstraction on its components.

## Product Features

      The software infrastructure enabling peering between CDNs can be featured with the following major
      goals:

        Development and validation of peering and manage the complexity of content delivery across Web servers of multiple CDNs that scale across the globe.
        Decrease cost of Web access, increase QoS through reduced latency, reduce server load, and bandwidth consumption (by a particular CDN server), thus improving the performance of content delivery.
        Assists an existing CDN to alleviate congestions by detecting and handling short-term load spikes (i.e. flash crowds) effectively.

      The operations performed by the product components [3] assist to realize the above goals.
      Component-wise major functions are noted below.
      The functions of the Web server(s) and its constituents are as follows,

        A Web server replicates content on-demand from the origin server and stores it for future use.
        In the event of Web hotspot, it initiates request to trigger peering.
        The Web services host ensures the delivery of content to end-users based on the negotiated policies with other CDNs.
        The policy agent is responsible (in conjunction with the mediator) for determining which resources can be delegated and under what conditions (policies) delegation is permitted.
        The SLA-allocator performs the provisioning and reservation of Web server’s resources (e.g. CPU, bandwidth, storage etc.) to satisfy both local and delegated SLAs, and ensures that the terms of the SLAs are enforced.
        The Web servers’ underlying algorithms perform on-demand caching, content selection, and routing between servers.

      The Mediator performs the following major functions,

        It generates service requirements as the basis for negotiated relationships.
        It passes the service requirements to the PA.
        It works in conjunction with its local PA to discover external resources and to negotiate with other CDNs.
        Once a peering arrangement is established, it controls what portion of the Web traffic (i.e. end-user requests) is redirected to the Web servers of the peering CDNs, which content is replicated there, how the replication decision is taken, and which replication policies are being used.
        It ensures that the participating entities are able to adapt to changing circumstances (agility) and are able to achieve their objectives in a dynamic and uncertain environment (resilience)

      The main functions of the Service Registry are as follows,

        It encapsulates the resource and service information for each CDN.
        It helps in discovering local resources through enabling the Web servers of CDN providers to register and publish their resource, service and policy details.
        In the face of traffic surges, it supplies any necessary local resource information to the mediator.
        When a new peering arrangement is established, an instance of the service registry is created that encapsulates all local and delegated external CDN resources.

      The Policy Repository is used to perform the following functions,

        It virtualizes all of the policies within a peering arrangement including PWS, PM, and PPeering (i.e. Web server-specific policies, mediator policies, peering policies), along with any delegated policies for resources as a result of the peering arrangement.
        It provides a set of rules to the mediator to administer, manage, and control access to the resources in a peering arrangement.
        It returns existing peering policies to the PA during the establishment of long-term peering arrangements.

      A Peering Agent carries out the following major functions,

        It acts as a policy-driven resource discovery module for establishing negotiations.
        It exchanges policy, resource information, and service requirements with external PAs.
        It is used as a conduit by the mediator to establish negotiations with PAs of other peers and to acquire resources from them.

      The operations performed by the components of the CDN peering is driven by semi-autonomous logic
      that ensures content is served reliably through content replication, request-routing and redirection
      whilst maintaining constant awareness of the health (e.g. load information) of participants. These
      major architectural features of the CDN peering are briefly described in the following:

        Content replication is performed using a cooperative pull-based approach where participating CDNs assist each others in serving data. Thus, content replication is featured through extending it to participating servers from the peers in a given peering arrangement, subject to the available resources they contribute
        Load distribution is performed by measuring the load information and disseminating it within individual CDNs and amongst other CDNs using a hierarchical approach, where current bandwidth and resource usage of web servers in a CDN is reported to the CDN gateway (i.e. mediator, PA and policy repository as a single conceptual entity) in a periodic or thresholdbased manner. The gateways of participating CDNs then communicate aggregated load information describing the load of their constituent servers.
        Request assignment and redirection is performed at multiple levels – at the DNS, at the gateways to local clusters, and also (redirection) between servers in a cluster. Therefore, endusers can be assigned via DNS (by the peering agents of participating CDNs updating their DNS records regularly) and also via redirection at the CDN gateway when appropriate.

## User Classes and Characteristics

      The users of the software infrastructure enabling CDN peering can be differentiated by using their
      membership and contributions to the system. A given peering arrangement consists of explicit and
      implicit members. Explicit members include the primary CDN, which is the initiator of a peering
      relationship, and any peering CDNs who cooperate for resource sharing. Implicit members are content
      providers and end-users. Implicit members are transparent to a peering arrangement but they share the
      benefit from it. In addition, users can vary based on the purpose, size, scope and duration of peering.
      For instance, a short-term peering arrangement is to be automated to react within a tight time
      frameas it is unlikely that a human directed negotiation would occur quickly enough to satisfy the
      evolved niche. On the other hand, establishment of a long-term peering arrangement calls for a
      human-directed agent to ensure that any resulting decisions comply with participating CDNs’
      strategic goals. Users can also be classified because of the preferential treatment that they may receive
      due to the policy that pertains to a particular provider’s business logic. Moreover, individual users (or
      a group of users) can have dynamic QoS requirements depending on the situations that will result in
      “customized” content delivery. Thus, users (or class of users) can be differentiated based on userdefined
      QoS specifications while accessing the service.

## Operating Environment

      The product (i.e. prototype system) enabling CDN peering is expected to be deployed it in a realworld
      test bed such as PlanetLab for global testing, observations, and for performance evaluation. In
      this regard, existing Web services technologies will be studied in detail to examine the feasibility of
      leveraging them. A modular implementation stack could be developed on top of the existing standard
      application layer (e.g. Apache, Tomcat) and protocols (e.g. HTTP, CDI, HTPC). A modular
      implementation approach would be useful to perform testing on modules at different stages to ensure
      correct implementation. It is anticipated that a cryptographically secure auction-based framework will
      be used to assist content replication among peered CDNs to allow incentives for all participants. Load
      information could be measured and disseminated within individual CDNs and among other CDNs
      using distributed load indices such as Distributed Hash Table (DHT) or variations of it. Request
      assignment and redirection could predominantly rely on DNS-level end-user assignment combined
      with a rudimentary request assignment policy such as weighted round-robin or least-loaded-first,
      which updates the DNS records to point to the most appropriate replica server of the peers.

## Design and Implementation Constraints

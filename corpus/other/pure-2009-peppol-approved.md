## Functional and non-functional requirements specification for the product, including critical synthesis, comparison and assessment of national vs. pan-European needs

1.1
2009-11-09
D2.1

## Preface

    This preface provides a short overview about the comments received from the EC and other sources
    and how these comments and remarks will be taken into consideration in future/ongoing work.
    The review reflected that WP2 presents with its deliverable D2.1 “an ambitious, high quality vision,
    reflected in a 4 stage maturity model, which is well argued.” The general feedback received for this
    document was positive, especially highlighting various insightful remarks. On the other hand the
    review process has generated some criticism which will be addressed by WP2 in future works. The
    following description responds to these comments and criticism by arguing how and where revisions
    and updates of the work presented in this deliverable will be implemented in subsequent results of WP
    2.
    First of all, D2.1 will be updated and improved in the following respects:

      The executive summary will be elaborated and improved in the upcoming Version 1.2.
      The goals of chapter 3 will be described in more detail. The term “framework” thereby seems
        to be misleading and will be replaced by a more suitable expression. The general descriptions
        and structure of chapter 3 will be maintained. Responding to criticism from the review, strong
        interconnections will be added to the subsequent deliverable D2.2, which will give a more
        detailed description of the organisational, semantic, technical and legal specifications of the
        the product concept. In D2.2., the requirements stated in D 2.1 will be reconsidered and transformed
        into a tabular collection of functional and non-functional requirements grouped for different
        components of the overall the product concept (see subsequent contents of D 2.2)

      The conclusions will be amended in the upcoming Version 1.2 of D 2.1.

    A request was made to further detail the generic scope and nature of D2.1. WP 2 will respond to this
    request by adding interrelations of D2.1 with D2.2, which aims at the detailed specifications of the
    the product concept, pilot and components. WP 2 planned the first deliverable as laying the basis for the
    subsequent detailed specifications, i.e. focus was put on the analysis and general concept of the product. It
    should be noted that such the product concept currently does not exist. Even in CEN BII, only an early draft
    of a qualification profile exists. Hence, the first specification document of WP 2 was dedicated to
    general analysis and overall concept with an analysis of requirements at organisational, semantic,
    technical and legal level. The subsequent deliverable D2.2 will convey the specifications and design of
    the individual the product components, including the pilot designs, hence detailing and counterbalancing the
    requirements of D 2.1 with conceptual descriptions / specifications. The following components of the
    the product implementation will be covered within D2.2:

        The pre-the product mapping pilot (subsequently called European the product service), which is a tool that
        informs an economic operator about what evidences s/he has to provide in order to comply
        with the selection and exclusion criteria set out in a call for tender or contract notice of a
        contracting authority in another country: This service will comprise of an ontology, an ontology
        manager and the product interaction tool, which does the reasoning (mapping) and provides the
        interface for a user to query the ontology for the mapping. The tool will furthermore generate a
        the product package skeleton based on the product schema. With this structure, the product service
        provider can easily insert the evidences and pack everything into the product package for the
        requestor (economic operator).

        the product schema specification comprised of a logical data model and a physical
        representation in XML will be the standard format to ensure interoperable the product package
        implementation.

        the product services which will compile the product packages in five pilot member states (after the
        the product enlargement procedure, three new pilots have been added to WP 2): These the product
        services will implement a number of services to query and collect evidences from different
        issuing bodies and to pack the individual evidences into a full the product package thereby also
        extracting certain metadata and context specific data which will facilitate machine-readability
        and quick evaluation of the product package.

        Besides above technical specifications, the evaluation of legal compliance of these technical
        specifications is performed. The results of these evaluations will be fed into the specifications
        of the components indicated above.

        Likewise, organisational specifications will detail the processes of interaction between users,
        the scenarios for the production pilots, test and evaluation guidelines as well as business
        models of pilots, and governance and maintenance structures to ensure long-term
        sustainability.

    One of the comments was that a structured review of the state of practice is missing in this report.
    WP2 has strongly interconnected D2.1 to the state of practice report published by DG market1:
    'eCertificates' feasibility study (Preliminary study on the electronic provision of certificates and
    attestations usually required in public procurement procedures). In reference to this, D2.2 will
    comprise a short overview of the updated state of practice and the relation to current more detailed
    results of WP2.

## Introduction: Motivation for a Virtual Company Dossier

    The effective use of Information and Communication Technology (ICT) to enable interoperability in
    public procurement is an area of great significance for achieving the Lisbon objectives, i.e. to become
    the most competitive and dynamic knowledge-based economy in the world (EC 2005). However, the
    current European public eProcurement infrastructure is inappropriate because it is characterized by a
    high market fragmentation and a lack of interoperability. Hence, a major objective of the European
    Commission is to enable European-wide eProcurement across borders by creating common principles
    and technical solutions that are applied within all Member States. eProcurement requires efforts to be
    done by public administrations, in particular to exploit new technologies for interoperability that enable
    easy information accessibility, improving the availability of pan-European services and interaction
    among citizens and businesses (European_Dynamics_S_A 2004).
    Governments are the largest buyer in the European Union which purchase at a level of approximately
    15-20% of GDP (Ministerial_Declaration 2005). Governments are lagging behind major industries in
    exchanging relevant data with key actors such as suppliers. Common standards for electronic data
    exchange seem to be a key element for companies to participate in public eProcurement. A Europeanwide
    eProcurement infrastructure could save governments up to 5% on expenditure and the
    transaction costs for both buyers and suppliers could be reduced by 50-80%. A greater competition
    and efficiency in eProcurement will influence the whole economy and may also play an important role
    in achieving the Lisbon objectives, e.g. to become the most competitive and dynamic knowledgebased
    economy in the world (Commission_of_the_European_Communitites 2004).
    The Manchester ministerial declaration of 24 November 2005 defines the target that
    ((Ministerial_Declaration 2005) p.4): “By 2010 all public administrations across Europe will have the
    capability of carrying out 100% of their procurement electronically, where legally permissible, thus
    creating a fairer and more transparent market for all companies independent of a company’s size or
    location within the single market. By 2010 at least 50% of public procurement above the EU public
    procurement threshold will be carried out electronically. Over the period 2006-2010 Member States
    will focus their efforts on delivering those high impact services in Europe which will contribute most to
    the achievement of the Lisbon Agenda.”
    It is expected that an interoperable eProcurement infrastructure ensures equal treatment and nondiscrimination
    and that it facilitates fairer and more effective competition in the European market by
    enabling suppliers to compete in an open and transparent way. However, current eProcurement
    infrastructures are inappropriate to reach this ambitious aim since these are characterized by a high
    market fragmentation. A lack of interoperability – different, non-operable and incompatible technical
    solutions – hinders suppliers in accessing eProcurement systems and discourages their participation
    cause of additional difficulties or increased costs (Commission_Staff_Working_Document
    08.07.2005).
    Across Europe, eProcurement systems have already been developed with a focus on the automation
    of different eProcurement procedures. Current systems reflect various country-specific public
    procurement needs and national laws, priorities, and practices. Systems are either centrally oriented
    or designed to reflect federated systems demands. In addition, varying terminologies are used within
    the European Member States. The lack of a unified eProcurement terminology is a major barrier which
    affects the possibility of a smooth collaboration between Member States and their eProcurement
    systems (Commission_of_the_European_Communitites 2004). Legal, technical and organisational
    barriers prevent the development of a common Procurement infrastructure and are one of the greatest
    challenges to be solved by politics, governments, ICT industry and research
    (European_Dynamics_S_A 2004).
    To facilitate EU-wide interoperability in public eProcurement, the European Commission co-funds the
    the product project in the ICT Policy Support Programme within the Competiveness and Innovation
    framework Programme (CIP). PEPPOL2 aims at setting up pan-European pilot solutions that
    conjointly exist with national infrastructures.
    Among the building blocks the product consortium develops, the Virtual Company Dossier (the product)
    focuses on an interoperable solution which contains the documents required from economic operators
    to evidence their qualification as well as qualitative selection or exclusion according to the directive
    2004/18/EC.

## Need for a Virtual Company Dossier

      A the product will facilitate electronic Tendering by providing cross-border data and document solution that
      contains the necessary attestations and certificates typically required in eTendering. Thus it can be
      seen as a container for documents. Yet up to now, the tendering documents such as attestations and
      certificates required in public procurement procedures differ between Member States. When a
      contracting authority publishes a contract notice, it shall include the selection, qualification and nonexclusion
      criteria. The economic operators have to submit evidence and proof in respect of these
      criteria. Hence, during the preparation of the tender an economic operator needs to collect the
      respective evidences (i.e. certificates and qualification documents) from a number of issuing bodies
      (e.g. public registries, banks, pre-qualification bodies, etc.) to prove conformance with the given
      selection and exclusion criteria.
      The overall aims and expectations of a virtual company dossier solution as set out in the description of
      work can be described as follows:

        1. the product will support any authorised entities (economic operator, intermediary, contracting
          authority or IT service such as an eTendering system) in creating an electronic information
          package consisting of the required documentation, evidences, proof, attestations, certificates,
          declarations and metadata.

        2. In order to create the product, an implemented IT system will have to collect certificates and
          attestations from existing registries. It also enables the economic operator to add self-declarations
          or other documents of formal qualification.

        3. Furthermore, the product solution supports economic operators in producing the product and in enabling
          them to submit the required documentation (assembled as an information package) to any
          contracting authority in Europe.

         4. In the same way the product as an implemented IT system will enable contracting authorities or their
          eTendering systems to interpret and accept the documentation submitted by the economic
          operator.

          5. Therefore the contracting authority must either specify the documentation that has to be submitted
          by economic operator or the criteria of qualitative selection and exclusion that have to be fulfilled
          by the economic operator.

          6. For all parties (economic operator, intermediary, contracting authority, issuing bodies) it will be of
          high importance that the product Service Providers are trustworthy; this implies that the services are
          precise, up-to-date, available and reliable.

      A major challenge of PEPPOLs’ work package 2 is to integrate various stakeholders in the
      development process and to set up an IT system which supports a common set of evidences based
      on electronic business certificates and qualification documents that are most frequently required. The
      criteria must be consistent with directive 2004/18/EC (EC 30.04.2004):

        Article 45 - Personal situation of the candidate or tenderer: e.g. absence of conviction,bankruptcy, fulfilment of payments of social security contributions or taxes, etc.
        Article 46 - suitability to pursue a professional activity: e.g. certificate of registration from thecommercial register
        Article 47 - economic and financial standing: e.g. balance sheets
        Article 48 - technical and/or professional ability of economic operators, e.g. certificates ofsatisfactory execution of past works
        Article 49 - quality assurance standards, e.g. ISO certificates
        Article 50 - environmental management standards
        (Article 51 - Additional documentation and information)

      Criteria are listed in the Directive and can be established by the contracting authority within the
      contract notice. A key aspect in the product development is to support a common set of criteria for
      qualitative selection and exclusion derived from the directive and their fulfilment through evidences.
      Work package 2 will not implement a common set of attestations. Thereby it must be taken into
      account that some countries do not issue such documents or certificates (e.g. in Norway extracts from
      the judicial record may be produced in respect of economic operators, but not in respect of private
      persons, for the purpose of a tender procedure) and this hinders economic operators to evidence
      certain criteria. In such cases, economic operators can only provide similar evidences that fulfil the
      same criteria. Where the country in question does not issue such documents or certificates, or where
      these do not cover all the cases they may be replaced by a declaration on oath, a solemn declaration,
      a notary or a competent professional or trade body, in the country of origin or in the country whence
      that person comes. So the link between individual evidences and the respective criteria they may
      approve for (as listed above) must be precisely indicated and mapped in order to support economic
      operators in their activity.
      Besides the mapping of criteria and evidences in a respective country, directive 2004/18/EC indicates
      also the need for accessibility of “Official lists of approved economic operators and certification by
      bodies established under public or private law” (cf. Article 52). Article 52 indicates a potential solution
      which may be addressed in the product development too.

## 1.2 Status quo of evidencing selection and exclusion criteria in generic tendering procedure

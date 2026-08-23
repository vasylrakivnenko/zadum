Understanding the life cycle of orders

When integrating the product with other systems, it is important that you understand how orders and related objects
such as order positions, fees, payments, refunds, and invoices work together, in order to react to their changes
properly and map them to processes in your system.

Order states

Generally, an order can be in six states. For compatibility reasons, the status field only allows four values
and the two remaining states are modeled through the require_approval field and the number of positions within
an order. The states and their allowed changes are shown in the following graph:

Object types

Order
    One order represents one purchase. It's the main object you interact with and bundles all the other objects
    together. Orders can change in many ways during their lifetime, but will never be deleted (unless testmode
    is set to true).

Order position
    An order position represents one product contained in the order. Orders can usually have multiple positions.
    There might be a parent-child relation between order positions if one position is an add-on to another position.
    Order positions can change in many ways during their lifetime, and can also be removed or added to an order.

Order fees
    A fee represents a charge that is not related to a product. Examples include shipping fees, service fees, and
    cancellation fees.
    Order fees can change in many ways during their lifetime, and can also be removed or added to an order.

Order payment
    An order payment represents one payment attempt with a specific payment method and amount. An order can have
    multiple payments attached.
    Order payments have their own state diagram. Apart from their state and their meta information (e.g. used
    credit card, …) they usually don't change. They may be added at any time, but will never be deleted.

Order refund
    An order payment represents one refund attempt with a specific payment method and amount. An order can have
    multiple refunds attached.
    Order refunds have their own state diagram. Apart from their state and their meta information (e.g. used
    credit card, …) they usually don't change. They may be added at any time, but will never be deleted.

Invoice
    An invoice represents a legal document stating the contents of an order. While the backend technically allows
    to update an invoice in some situations, invoices are generally considered immutable. Once they are issued,
    they no longer change. If the order changes substantially (e.g. prices change), an invoice is canceled through
    creation of a new invoice with the opposite amount, plus the issuance of a new invoice.

Here's an example of how they all play together:

Data model

the product provides the following data(base) models. Every model and every model method or field that is not
documented here is considered private and should not be used by third-party plugins, as it may change
without advance notice.

User model

Organizers and events

Items

Carts and Orders

Logging

Invoicing

Vouchers

Permissions

the product uses a fine-grained permission system to control who is allowed to control what parts of the system.
The central concept here is the concept of *Teams*. You can read more on `configuring teams and permissions`_
and the product.base.models.Team model in the respective parts of the documentation. The basic digest is:
An organizer account can have any number of teams, and any number of users can be part of a team. A team can be
assigned a set of permissions and connected to some or all of the events of the organizer.

A second way to access the product is via the REST API, which allows authentication via tokens that are bound to a team,
but not to a user. You can read more at the product.base.models.TeamAPIToken. This page will show you how to
work with permissions in plugins and within the product code base.

Requiring permissions for a view

the product provides a number of useful mixins and decorators that allow you to specify that a user needs a certain
permission level to access a view:

    from the product.control.permissions import (
        OrganizerPermissionRequiredMixin, organizer_permission_required
    )

    class MyOrgaView(OrganizerPermissionRequiredMixin, View):
        permission = 'organizer.settings.general:write'
        # Only users with the permission organizer.settings.general:write on
        # this organizer can access this

    class MyOtherOrgaView(OrganizerPermissionRequiredMixin, View):
        permission = None
        # Only users with *any* permission on this organizer can access this

    @organizer_permission_required('organizer.settings.general:write')
    def my_orga_view(request, organizer, kwargs):
        # Only users with the permission organizer.settings.general:write on
        # this organizer can access this

    @organizer_permission_required()
    def my_other_orga_view(request, organizer, kwargs):
        # Only users with *any* permission on this organizer can access this

Of course, the same is available on event level:

    from the product.control.permissions import (
        EventPermissionRequiredMixin, event_permission_required
    )

    class MyEventView(EventPermissionRequiredMixin, View):
        permission = 'event.settings.general:write'
        # Only users with the permission event.settings.general:write on
        # this event can access this

    class MyOtherEventView(EventPermissionRequiredMixin, View):
        permission = None
        # Only users with *any* permission on this event can access this

    class MyThirdEventView(EventPermissionRequiredMixin, View):
        permission = AnyPermissionOf('event.settings.payment:write', 'event.settings.general:write')
        # Only users with at least one of the specified permissions on this event
        # can access this

    @event_permission_required('event.settings.general:write')
    def my_event_view(request, organizer, kwargs):
        # Only users with the permission event.settings.general:write on
        # this event can access this

    @event_permission_required()
    def my_other_event_view(request, organizer, kwargs):
        # Only users with *any* permission on this event can access this

You can also require that this view is only accessible by system administrators with an active "admin session"
(see below for what this means):

    from the product.control.permissions import (
        AdministratorPermissionRequiredMixin, administrator_permission_required
    )

    class MyGlobalView(AdministratorPermissionRequiredMixin, View):
        # ...

    @administrator_permission_required
    def my_global_view(request, organizer, kwargs):
        # ...

In rare cases it might also be useful to expose a feature only to people who have a staff account but do not
necessarily have an active admin session:

    from the product.control.permissions import (
        StaffMemberRequiredMixin, staff_member_required
    )

    class MyGlobalView(StaffMemberRequiredMixin, View):
        # ...

    @staff_member_required
    def my_global_view(request, organizer, kwargs):
        # ...

Requiring permissions in the REST API

When creating your own viewset using Django REST framework, you just need to set the permission attribute
and the product will check it automatically for you::

    class MyModelViewSet(viewsets.ReadOnlyModelViewSet):
        permission = 'event.orders:read'

Checking permission in code

If you need to work with permissions manually, there are a couple of useful helper methods on the product.base.models.Event,

Return all users that are in any team that is connected to this event::

    >>> event.get_users_with_any_permission()
    <QuerySet: …>

Return all users that are in a team with a specific permission for this event::

    >>> event.get_users_with_permission('event.orders:read')
    <QuerySet: …>

Determine if a user has a certain permission for a specific event::

    >>> user.has_event_permission(organizer, event, 'event.orders:read', request=request)
    True

Determine if a user has any permission for a specific event::

    >>> user.has_event_permission(organizer, event, request=request)
    True

In the two previous commands, the request argument is optional, but required to support staff sessions (see below).

The same method exists for organizer-level permissions::

    >>> user.has_organizer_permission(organizer, 'event.orders:read', request=request)
    True

Sometimes, it might be more useful to get the set of permissions at once::

    >>> user.get_event_permission_set(organizer, event)
    {'event.settings.general:write', 'event.orders:read', 'event.orders:write'}

    >>> user.get_organizer_permission_set(organizer, event)
    {'organizer.settings.general:write', 'organizer.events:create'}

Within a view on the /control subpath, the results of these two methods are already available in the
request.eventpermset and request.orgapermset properties. This makes it convenient to query them in templates::

    {% if "event.orders:write" in request.eventpermset %}
        …
    {% endif %}

You can also do the reverse to get any events a user has access to::

    >>> user.get_events_with_permission('event.settings.general:write', request=request)
    <QuerySet: …>

    >>> user.get_events_with_any_permission(request=request)
    <QuerySet: …>

Most of these methods work identically on the product.base.models.TeamAPIToken.

Staff sessions

System administrators of the product instance are identified by the is_staff attribute on the user model. By default,
the regular permission rules apply for users with is_staff = True. The only difference is that such users can
temporarily turn on "staff mode" via a button in the user interface that grants them all permissions as long as
staff mode is active. You can check if a user is in staff mode using their session key:

    >>> user.has_active_staff_session(request.session.session_key)
    False

Staff mode has a hard time limit and during staff mode, a middleware will log all requests made by that user. Later,
the user is able to also save a message to comment on what they did in their administrative session. This feature is
intended to help compliance with data protection rules as imposed e.g. by GDPR.

Adding permissions

Plugins can add permissions through the register_event_permission_groups and register_organizer_permission_groups.
We recommend to use this only for very significant permissions, as the system will become less usable with too many
permission levels, also because the team page will show all permission options, even those of disabled plugins.

To register your permissions, you need to register a permission group (often representing an area of functionality
or a key model). Below that group, there are actions, which represent the actual permissions. Permissions will be
generated as <group_name>:<action>. Then, you need to define options which are the valid combinations of the
actions that should be possible to select for a team. This two-step mechanism exists to provide a better user experience
and avoid useless combinations like "write but not read".

Example::

    @receiver(register_event_permission_groups)
    def register_plugin_event_permissions(sender, kwargs):
        return [
            PermissionGroup(
                name="pretix_myplugin.resource",
                label=_("Resources"),
                actions=["read", "write"],
                options=[
                    PermissionOption(actions=tuple(), label=_("No access")),
                    PermissionOption(actions=("read",), label=_("View")),
                    PermissionOption(actions=("read", "write"), label=_("View and change")),
                ],
                help_text=_("Some help text")
            ),
        ]

    @receiver(register_organizer_permission_groups)
    def register_plugin_organizer_permissions(sender, kwargs):
        return [
            PermissionGroup(
                name="pretix_myplugin.resource",
                label=_("Resources"),
                actions=["read", "write"],
                options=[
                    PermissionOption(actions=tuple(), label=_("No access")),
                    PermissionOption(actions=("read",), label=_("View")),
                    PermissionOption(actions=("read", "write"), label=_("View and change")),
                ],
                help_text=_("Some help text")
            ),
        ]

Time machine mode

In test mode, the product provides a "time machine" feature which allows event organizers
to test their shop as if it were a different date and time. To enable this feature, they can
click on the "time machine"-link in the test mode warning box on the event page.

Internally, this time machine mode is implemented by calling our custom time_machine_now()
function instead of django.utils.timezone.now() in all places where the fake time should be
taken into account. If you add code that uses the current date and time for checking whether some
product can be bought, you should use time_machine_now.

Background tasks

The time machine datetime is passed through the request flow via a thread-local variable (ContextVar).
Therefore, if you call a background task in the order process, where time_machine_now should be
respected, you need to pass it through manually as shown in the example below:

    @app.task()
    def my_task(self, override_now_dt: datetime=None) -> None:
        with time_machine_now_assigned(override_now_dt):
            # ...do something that uses time_machine_now()

    my_task.apply_async(kwargs={'override_now_dt': time_machine_now(default=None)})
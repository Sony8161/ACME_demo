resource "aws_cloudfront_origin_access_control" "this" {
  count                             = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  name                              = local.origin_id
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "this" {
  count               = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200"

  origin {
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_id                = local.origin_id
    origin_access_control_id = element(aws_cloudfront_origin_access_control.this.*.id, count.index)
  }

  dynamic "origin" {
    for_each = local.function_origins
    content {
      domain_name = origin.value.domain_name
      origin_id   = origin.value.origin_id

      custom_header {
        name  = "X-Forwarded-Host"
        value = origin.value.domain_name
      }

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
        # Allow Lambda cold starts + database (re)connects without a CloudFront 504
        origin_read_timeout = 60
      }
    }
  }

  # NOTE: no distribution-wide custom_error_response (404 -> index.html): it would also
  # rewrite API errors into HTML. SPA deep links are handled by the viewer-request
  # function on the default (S3) behavior instead.

  # logging_config {
  #   include_cookies = false
  #   bucket          = var.aws_bucket
  #   prefix          = "cdn_website_logs/"
  # }

  dynamic "ordered_cache_behavior" {
    for_each = local.function_origins
    content {
      path_pattern     = "/api/${ordered_cache_behavior.value.name}*"
      target_origin_id = ordered_cache_behavior.value.origin_id

      allowed_methods        = ["GET", "HEAD", "OPTIONS", "DELETE", "PATCH", "POST", "PUT"]
      cached_methods         = ["GET", "HEAD"]
      viewer_protocol_policy = "redirect-to-https"

      # Use managed cache policy for no caching (ID: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad)
      cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

      # Use managed origin request policy - AllViewerExceptHostHeader
      # This forwards all viewer headers EXCEPT Host, so Lambda Function URLs get the correct Host header
      # (ID: b689b0a8-53d0-40ab-baf2-68738e2966ac = AllViewerExceptHostHeader)
      origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"

      # Legacy cache settings (commented out - using managed policies above)
      # min_ttl     = 0
      # default_ttl = 0
      # max_ttl     = 0

      # forwarded_values {
      #   query_string = true
      #   headers      = ["*"]

      #   cookies {
      #     forward = "all"
      #   }
      # }
    }
  }

  default_cache_behavior {
    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    default_ttl = 3600
    max_ttl     = 86400
    min_ttl     = 0

    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
    response_headers_policy_id = element(aws_cloudfront_response_headers_policy.site_security.*.id, count.index)

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    # Serve index.html for extension-less paths so client-side routes survive a refresh
    function_association {
      event_type   = "viewer-request"
      function_arn = element(aws_cloudfront_function.spa_rewrite.*.arn, count.index)
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.app_tags
}

# Viewer-request function: rewrites SPA routes (no file extension) to /index.html.
# API paths are served by their own cache behaviors and never reach this function.
# Browser protections for the website (the API sets its own). The policy lets the app load only its own scripts, styles, fonts and
# images and talk only to its own address; MUI writes inline styles, hence 'unsafe-inline' for styles but never for scripts.
locals {
  site_csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
}

resource "aws_cloudfront_response_headers_policy" "site_security" {
  count = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  name  = format("%s-site-security-%s", var.aws_project, local.app_id)

  security_headers_config {
    content_security_policy {
      content_security_policy = local.site_csp
      override                = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }
  }
}

resource "aws_cloudfront_function" "spa_rewrite" {
  count   = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  name    = format("%s-spa-rewrite-%s", var.aws_project, local.app_id)
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/spa-rewrite.js")
}

resource "aws_s3_bucket_policy" "this" {
  count  = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  bucket = aws_s3_bucket.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = data.aws_service_principal.cloudfront.name
        }
        Action   = "s3:GetObject"
        Resource = format("%s/*", aws_s3_bucket.this.arn)
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = format(
              "arn:%s:cloudfront::%s:distribution/%s",
              data.aws_partition.this.partition,
              data.aws_caller_identity.this.account_id,
              element(aws_cloudfront_distribution.this.*.id, count.index)
            )
          }
        }
      }
    ]
  })
}
